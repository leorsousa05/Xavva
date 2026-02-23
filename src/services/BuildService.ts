import { readdirSync, copyFileSync, existsSync, statSync, mkdirSync } from "fs";
import path from "path";
import type { ProjectConfig, TomcatConfig } from "../types/config";
import { Logger } from "../utils/ui";

export class BuildService {
	private inferredAppName: string | null = null;

	constructor(private projectConfig: ProjectConfig, private tomcatConfig: TomcatConfig) { }

	async runBuild(incremental = false) {
		const command = [];
		
		if (this.projectConfig.buildTool === 'maven') {
			command.push("mvn");
			if (incremental) {
				command.push("compile");
			} else {
				command.push("clean", "package");
			}
			command.push("-DskipTests");
			if (this.projectConfig.profile) command.push(`-P${this.projectConfig.profile}`);
		} else {
			command.push("gradle");
			if (incremental) {
				command.push("classes");
			} else {
				command.push("clean", "build");
			}
			command.push("-x", "test");
			if (this.projectConfig.profile) command.push(`-Pprofile=${this.projectConfig.profile}`);
		}

		const stopSpinner = (this.projectConfig.verbose) ? () => {} : Logger.spinner(incremental ? "Incremental compilation" : "Full project build");

		const proc = Bun.spawn(command, { 
			stdout: "pipe",
			stderr: "pipe"
		});

		if (this.projectConfig.verbose) {
			await Promise.all([
				this.processBuildLogs(proc.stdout, false),
				this.processBuildLogs(proc.stderr, false)
			]);
		}

		await proc.exited;
		stopSpinner();

		if (proc.exitCode !== 0) {
            if (!this.projectConfig.verbose) {
                const err = await new Response(proc.stderr).text();
                console.log(err);
            }
            Logger.error(`${this.projectConfig.buildTool.toUpperCase()} build failed!`);
            throw new Error("Falha no build do Java!");
        }
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
							console.log(`\n  ${"\x1b[31m"}... e mais erros ocultos. Use -V para ver todos.${"\x1b[0m"}`);
						}
						continue;
					}
				}

				if (quiet) {
					if (!Logger.isEssential(cleanLine)) continue;
				} else if (Logger.isSystemNoise(cleanLine)) {
					continue;
				}

				const summarized = Logger.summarize(cleanLine);
				if (summarized) console.log(summarized);
			}
		}
	}

	async syncClasses(): Promise<string | null> {
		const fs = require("fs");
		let appFolder = this.projectConfig.appName || this.inferredAppName || "";

		const webappsPath = path.join(this.tomcatConfig.path, this.tomcatConfig.webapps);

		if (!appFolder && fs.existsSync(webappsPath)) {
			const folders = fs.readdirSync(webappsPath, { withFileTypes: true })
				.filter((dirent: any) => dirent.isDirectory() && !["ROOT", "manager", "host-manager", "docs"].includes(dirent.name));
			
			if (folders.length === 1) {
				appFolder = folders[0].name;
			} else if (folders.length > 1) {
				const sorted = folders.map((f: any) => ({
					name: f.name,
					time: fs.statSync(path.join(webappsPath, f.name)).mtimeMs
				})).sort((a: any, b: any) => b.time - a.time);
				appFolder = sorted[0].name;
			}
		}

		const sourceDir = this.projectConfig.buildTool === 'maven' ? 'target/classes' : 'build/classes/java/main';
		const destDir = path.join(webappsPath, appFolder, "WEB-INF", "classes");

		if (!fs.existsSync(sourceDir)) return null;
		
		if (!appFolder || !fs.existsSync(destDir)) {
			Logger.warn("Pasta descompactada no Tomcat não encontrada. Hot Swap impossível.");
			return null;
		}

		const copyDir = (src: string, dest: string) => {
			if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
			const list = fs.readdirSync(src, { withFileTypes: true });
			for (const item of list) {
				const s = path.join(src, item.name);
				const d = path.join(dest, item.name);
				if (item.isDirectory()) {
					copyDir(s, d);
				} else {
					if (!fs.existsSync(d) || fs.statSync(s).mtimeMs > fs.statSync(d).mtimeMs) {
						fs.copyFileSync(s, d);
					}
				}
			}
		};

		copyDir(sourceDir, destDir);
		Logger.success("Classes swapped in running Tomcat");
		return appFolder;
	}

	async deployToWebapps(): Promise<string> {
		const destDir = path.join(this.tomcatConfig.path, this.tomcatConfig.webapps);
		
		Logger.step("Searching for generated artifacts");
		
		const findWars = (dir: string): string[] => {
			let results: string[] = [];
			const list = readdirSync(dir, { withFileTypes: true });
			for (const item of list) {
				const res = path.resolve(dir, item.name);
				if (item.isDirectory()) {
					if (item.name === 'target' || item.name === 'build') {
						results = results.concat(findWars(res));
					} else if (!['node_modules', '.git', 'src', 'webapps', 'bin', 'conf', 'lib', 'logs', 'temp', 'work'].includes(item.name)) {
						results = results.concat(findWars(res));
					}
				} else if (item.name.endsWith('.war')) {
					results.push(res);
				}
			}
			return results;
		};

		const allWars = findWars(process.cwd())
			.map(f => ({ path: f, name: path.basename(f), time: statSync(f).mtime.getTime() }))
			.sort((a, b) => b.time - a.time);

		if (allWars.length === 0) {
			throw new Error('Nenhum arquivo .war encontrado! Verifique se o build realmente gerou um artefato.');
		}

		const warFile = allWars[0];
		const finalName = this.projectConfig.appName ? `${this.projectConfig.appName}.war` : warFile.name;

		if (!this.projectConfig.quiet) {
			Logger.info("Artifact", warFile.name);
			if (this.projectConfig.appName) Logger.info("Deploy as", finalName);
		} else {
			const displayName = this.projectConfig.appName ? `${this.projectConfig.appName}` : warFile.name.replace(".war", "");
			process.stdout.write(`  ${"\x1b[90m"}➜${"\x1b[0m"} Deploying ${"\x1b[1m"}${displayName}${"\x1b[0m"}...\n`);
		}
		
		copyFileSync(warFile.path, path.join(destDir, finalName));
		this.inferredAppName = finalName.replace(".war", "");
		return finalName;
	}
}
