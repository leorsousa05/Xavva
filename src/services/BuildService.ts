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

		if (!incremental && !this.projectConfig.skipBuild) {
			if (!this.projectConfig.clean && !this.cache.shouldRebuild(this.projectConfig.buildTool, this.projectService)) {
				Logger.success("Build cache hit! Skipping full build.");
				return;
			}
		}

		const command = [];
		const env: any = { ...process.env };
		
		if (this.projectConfig.buildTool === 'maven') {
			command.push(process.platform === "win32" ? "mvn.cmd" : "mvn");

			// Smart Offline: Se o pom.xml não mudou e é incremental ou rebuild forçado (mas cache existe), usa -o
			if (!this.cache.shouldRebuild('maven', this.projectService)) {
				command.push("-o");
			}

			if (incremental) {
				command.push("compile");
			} else {
				if (this.projectConfig.clean) command.push("clean");
				command.push("compile", "war:exploded");
				command.push("-T", "1C");
			}
			command.push("-Dmaven.test.skip=true", "-Dmaven.javadoc.skip=true");
			if (this.projectConfig.profile) command.push(`-P${this.projectConfig.profile}`);

			env.MAVEN_OPTS = "-Xms512m -Xmx1024m -XX:+UseParallelGC";
		} else {
			command.push(process.platform === "win32" ? "gradle.bat" : "gradle");
			if (incremental) {
				command.push("classes");
			} else {
				if (this.projectConfig.clean) command.push("clean");
				command.push("war");
				command.push("--parallel", "--build-cache");
			}
			command.push("-x", "test", "-x", "javadoc");
			if (this.projectConfig.profile) command.push(`-Pprofile=${this.projectConfig.profile}`);

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

	async syncExploded(srcDir: string, destDir: string): Promise<void> {
		if (!existsSync(srcDir)) return;
		if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
		await this.fastSync(srcDir, destDir);
	}

	async syncClasses(customSrc?: string): Promise<string | null> {
		const appFolder = this.projectService.getInferredAppName();
		const webappPath = path.join(this.tomcatConfig.path, "webapps", appFolder);
		const targetLib = path.join(webappPath, "WEB-INF", "classes");
		const sourceDir = customSrc || this.projectService.getClassesDir();

		if (!existsSync(sourceDir)) return null;
		if (!existsSync(targetLib)) mkdirSync(targetLib, { recursive: true });

		await this.fastSync(sourceDir, targetLib);
		return appFolder;
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

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value);
			const lines = chunk.split(/[\r\n]+/);

			for (const line of lines) {
				const cleanLine = line.trim();
				if (!cleanLine) continue;

				if (cleanLine.includes("[ERROR]")) {
					errorCount++;
					if (errorCount > maxErrors && !this.projectConfig.verbose) {
						if (errorCount === maxErrors + 1) {
							Logger.warn("... e mais erros ocultos. Use -V para ver todos.");
						}
						continue;
					}
				}

				if (!this.projectConfig.verbose) {
					// Lógica de sumarização omitida para brevidade
				} else {
					process.stdout.write(line + "\n");
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
