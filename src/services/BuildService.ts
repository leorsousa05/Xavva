import { readdirSync, existsSync, statSync, mkdirSync, promises as fs } from "fs";
import path from "path";
import type { ProjectConfig, TomcatConfig } from "../types/config";
import { Logger } from "../utils/ui";
import { BuildCacheService } from "./BuildCacheService";
import { ProjectService } from "./ProjectService";

export class BuildService {
	constructor(
		private projectConfig: ProjectConfig, 
		private tomcatConfig: TomcatConfig,
		private projectService: ProjectService,
		private cache: BuildCacheService
	) { }

	private getBinary(cmd: string): string {
		if (process.platform !== "win32") return cmd;
		
		// No Windows, procuramos primeiro por .cmd ou .bat
		const extensions = [".cmd", ".bat", ".exe", ""];
		// Se já tiver uma extensão, ignora
		if (path.extname(cmd)) return cmd;

		return cmd; // Bun.spawn no Windows geralmente resolve .cmd/.bat se estiver no PATH
		// Mas se o usuário reportou ENOENT, vamos forçar a verificação ou usar shell:true para o build
	}

	async runBuild(incremental = false) {
		if (this.projectConfig.clean) {
			this.cache.clearCache();
		}

		// Sempre limpa a pasta de build antes (target/ ou build/)
		if (!incremental) {
			await this.cleanBuildDirectory();
		}

		// Cache só é usado se --cache for passado ou em modo incremental
		const useCache = this.projectConfig.cache || incremental;
		
		if (useCache && !incremental && !this.projectConfig.skipBuild) {
			if (!this.projectConfig.clean && !this.cache.shouldRebuild(this.projectConfig.buildTool, this.projectService)) {
				Logger.success("Build cache hit! Skipping full build.");
				return;
			}
		}

		const command = [];
		const env: Record<string, string | undefined> = { ...process.env };
		
		if (this.projectConfig.buildTool === 'maven') {
			command.push(process.platform === "win32" ? "mvn.cmd" : "mvn");

			// Smart Offline: só usa -o se cache estiver habilitado e pom não mudou
			if (useCache && !this.cache.shouldRebuild('maven', this.projectService)) {
				command.push("-o");
			}

			if (incremental) {
				command.push("compile");
			} else {
				// Sempre executa clean antes do build
				command.push("clean");
				// Use 'package' para gerar .war ou 'war:exploded' para pasta
				if (this.projectConfig.war) {
					command.push("package");
				} else {
					command.push("compile", "war:exploded");
				}
				command.push("-T", "1C");
			}
			command.push("-Dmaven.test.skip=true", "-Dmaven.javadoc.skip=true");
			if (this.projectConfig.profile) command.push(`-P${this.projectConfig.profile}`);
			if (this.projectConfig.encoding) {
				command.push(`-Dproject.build.sourceEncoding=${this.projectConfig.encoding}`);
				command.push(`-Dproject.reporting.outputEncoding=${this.projectConfig.encoding}`);
			}

			env.MAVEN_OPTS = "-Xms512m -Xmx1024m -XX:+UseParallelGC";
		} else {
			command.push(process.platform === "win32" ? "gradle.bat" : "gradle");
			if (incremental) {
				command.push("classes");
			} else {
				// Sempre executa clean antes do build
				command.push("clean");
				command.push("war");
				command.push("--parallel", "--build-cache");
			}
			command.push("-x", "test", "-x", "javadoc");
			if (this.projectConfig.profile) command.push(`-Pprofile=${this.projectConfig.profile}`);
			if (this.projectConfig.encoding) {
				command.push(`-Dfile.encoding=${this.projectConfig.encoding}`);
			}

			env.GRADLE_OPTS = "-Xmx1024m -Dorg.gradle.daemon=true";
		}

		const stopSpinner = (this.projectConfig.verbose) ? () => {} : Logger.spinner(incremental ? "Incremental compilation" : "Full project build");

		// No Windows, comandos .cmd/.bat muitas vezes precisam de shell: true no Bun.spawn ou o nome exato.
		// Vamos usar o nome exato mvn.cmd/gradle.bat que é mais seguro que shell: true
		const proc = Bun.spawn(command, { 
			env,
			stdout: "pipe",
			stderr: "pipe"
		});

		if (this.projectConfig.verbose) {
			await Promise.all([
				this.processBuildLogs(proc.stdout as ReadableStream, false),
				this.processBuildLogs(proc.stderr as ReadableStream, false)
			]);
		}

		await proc.exited;
		stopSpinner();

		if (proc.exitCode !== 0) {
            if (!this.projectConfig.verbose) {
                const err = await new Response(proc.stderr).text();
                Logger.log(err);
            }
            Logger.error(`${this.projectConfig.buildTool.toUpperCase()} build failed!`);
            throw new Error("Falha no build do Java!");
        }

		if (!incremental) {
			this.cache.saveCache(this.projectConfig.buildTool);
		}
	}

	/**
	 * Limpa fisicamente o diretório de build (target/ ou build/)
	 * Garante build limpo antes de cada execução
	 */
	private async cleanBuildDirectory(): Promise<void> {
		const buildDir = this.projectConfig.buildTool === 'maven' 
			? path.join(process.cwd(), 'target')
			: path.join(process.cwd(), 'build');
		
		if (existsSync(buildDir)) {
			try {
				Logger.step(`Cleaning ${path.basename(buildDir)}/ directory...`);
				await fs.rm(buildDir, { recursive: true, force: true });
				Logger.debug(`Removed ${buildDir}`);
			} catch (e) {
				Logger.warn(`Could not fully remove ${buildDir}, continuing...`);
			}
		}
	}

	async syncExploded(srcDir: string, destDir: string): Promise<void> {
		if (!existsSync(srcDir)) return;
		if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
		await this.fastSync(srcDir, destDir);
	}

	async syncClasses(changedFiles?: string[]): Promise<string | null> {
		const appFolder = this.projectService.getInferredAppName();
		const webappPath = path.join(this.tomcatConfig.path, "webapps", appFolder);
		const targetLib = path.join(webappPath, "WEB-INF", "classes");
		const sourceDir = this.projectService.getClassesDir();

		if (!existsSync(sourceDir)) return null;
		if (!existsSync(targetLib)) mkdirSync(targetLib, { recursive: true });

		// Se temos uma lista específica de arquivos modificados, sincroniza apenas eles
		if (changedFiles && changedFiles.length > 0) {
			await this.syncSpecificFiles(changedFiles, sourceDir, targetLib);
		} else {
			// Caso contrário, sincroniza tudo (comportamento padrão)
			await this.fastSync(sourceDir, targetLib);
		}
		
		return appFolder;
	}

	/**
	 * Sincroniza apenas arquivos específicos baseado nos arquivos .java modificados.
	 * Converte .java para .class e sincroniza apenas os arquivos realmente modificados.
	 */
	private async syncSpecificFiles(changedFiles: string[], sourceDir: string, targetLib: string): Promise<void> {
		const tasks: Promise<void>[] = [];
		const syncedCount = { value: 0 };
		
		for (const javaFile of changedFiles) {
			// Converte caminho do .java para caminho do .class
			// Ex: src/main/java/com/example/Foo.java -> target/classes/com/example/Foo.class
			const relativePath = this.javaToClassPath(javaFile);
			if (!relativePath) continue;
			
			const sourcePath = path.join(sourceDir, relativePath);
			const targetPath = path.join(targetLib, relativePath);
			
			if (!existsSync(sourcePath)) {
				// Se o .class não existe, talvez seja um arquivo excluído ou inner class
				// Neste caso, faz sync completo como fallback
				continue;
			}
			
			tasks.push((async () => {
				const targetDir = path.dirname(targetPath);
				if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
				
				const srcStat = statSync(sourcePath);
				const destStat = existsSync(targetPath) ? statSync(targetPath) : null;
				
				if (!destStat || srcStat.mtimeMs > destStat.mtimeMs) {
					await fs.copyFile(sourcePath, targetPath);
					syncedCount.value++;
				}
			})());
		}
		
		await Promise.all(tasks);
		
		// Se não conseguimos sincronizar nenhum arquivo específico, faz sync completo
		if (syncedCount.value === 0) {
			await this.fastSync(sourceDir, targetLib);
		} else if (!this.projectConfig.quiet) {
			Logger.info("sync", `${syncedCount.value} classe(s) sincronizada(s)`);
		}
	}
	
	/**
	 * Converte caminho de arquivo .java para caminho relativo de .class
	 */
	private javaToClassPath(javaFile: string): string | null {
		// Remove prefixos comuns de diretórios source
		const parts = javaFile.split(/[/\\]/);
		
		// Encontra o índice após "java" ou "src/main/java" ou "src"
		let startIndex = -1;
		
		for (let i = 0; i < parts.length; i++) {
			if (parts[i] === "java" && i > 0 && (parts[i-1] === "main" || parts[i-1] === "test")) {
				startIndex = i + 1;
				break;
			}
		}
		
		// Se não encontrou padrão maven, tenta achar "src"
		if (startIndex === -1) {
			const srcIndex = parts.indexOf("src");
			if (srcIndex !== -1 && srcIndex < parts.length - 1) {
				// Pula "src" e possível "main/java"
				if (parts[srcIndex + 1] === "main" && parts[srcIndex + 2] === "java") {
					startIndex = srcIndex + 3;
				} else {
					startIndex = srcIndex + 1;
				}
			}
		}
		
		// Se ainda não encontrou, assume que o caminho já é relativo ao package
		if (startIndex === -1) {
			startIndex = 0;
		}
		
		// Pega o caminho relativo
		const relativeParts = parts.slice(startIndex);
		if (relativeParts.length === 0) return null;
		
		// Substitui extensão .java por .class
		const fileName = relativeParts[relativeParts.length - 1];
		if (!fileName || !fileName.endsWith(".java")) return null;
		
		relativeParts[relativeParts.length - 1] = fileName.replace(".java", ".class");
		
		return path.join(...relativeParts);
	}

	private async fastSync(src: string, dest: string) {
		const entries = readdirSync(src, { withFileTypes: true });
		
		const tasks = entries.map(async (entry) => {
			const srcPath = path.join(src, entry.name);
			const destPath = path.join(dest, entry.name);

			if (entry.isDirectory()) {
				if (!existsSync(destPath)) mkdirSync(destPath, { recursive: true });
				await this.fastSync(srcPath, destPath);
			} else {
				const srcStat = statSync(srcPath);
				const destStat = existsSync(destPath) ? statSync(destPath) : null;

				if (!destStat || srcStat.mtimeMs > destStat.mtimeMs) {
					await fs.copyFile(srcPath, destPath);
				}
			}
		});

		await Promise.all(tasks);
	}

	private async processBuildLogs(stream: ReadableStream, quiet: boolean) {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let errorCount = 0;
		const maxErrors = 15;
		const buildTool = this.projectConfig.buildTool as 'maven' | 'gradle';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value);
			const lines = chunk.split(/[\r\n]+/);

			for (const line of lines) {
				const cleanLine = line.trim();
				if (!cleanLine) continue;

				if (cleanLine.includes("[ERROR]") || cleanLine.includes("error:")) {
					errorCount++;
					if (errorCount > maxErrors && !this.projectConfig.verbose) {
						if (errorCount === maxErrors + 1) {
							Logger.warn("... and more errors hidden. Use -V to see all.");
						}
						continue;
					}
				}

				if (!this.projectConfig.verbose) {
					// Modo não-verbose: usa sumarização existente
					const formatted = Logger.formatBuildLog(cleanLine, buildTool);
					if (formatted) console.log(formatted);
				} else {
					// Modo verbose: formata mas mantém estrutura
					const formatted = Logger.formatBuildLog(cleanLine, buildTool);
					if (formatted) {
						console.log(formatted);
					}
					// Silencia linhas que são noise puro
				}
			}
		}
	}

	async deployToWebapps(): Promise<{ path: string, finalName: string, isDirectory: boolean }> {
		const artifact = this.projectService.getArtifact();
		return {
			path: artifact.path,
			finalName: artifact.name,
			isDirectory: artifact.isDirectory
		};
	}
}
