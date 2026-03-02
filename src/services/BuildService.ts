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
		const env = { ...process.env };
		
		if (this.projectConfig.buildTool === 'maven') {
			command.push("mvn");

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
			command.push("gradle");
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

		const proc = Bun.spawn(command, { 
			stdout: "pipe",
			stderr: "pipe",
			env: env as any
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

				if (quiet) {
					if (!Logger.isEssential(cleanLine)) continue;
				} else if (Logger.isSystemNoise(cleanLine)) {
					continue;
				}

				const summarized = Logger.summarize(cleanLine);
				if (summarized) Logger.log(summarized);
			}
		}
	}

	async syncClasses(customSrc?: string): Promise<string | null> {
		const appFolder = this.projectService.getInferredAppName();
		const webappsPath = path.join(this.tomcatConfig.path, this.tomcatConfig.webapps);

		const sourceDir = customSrc || this.projectService.getClassesDir();
		const destDir = customSrc ? path.join(webappsPath, appFolder) : path.join(webappsPath, appFolder, "WEB-INF", "classes");

		if (!existsSync(sourceDir)) return null;
		if (!appFolder || !existsSync(destDir)) {
			if (customSrc && appFolder) {
				mkdirSync(destDir, { recursive: true });
			} else {
				return null;
			}
		}

		const fastSync = async (src: string, dest: string) => {
			if (!existsSync(dest)) await fs.mkdir(dest, { recursive: true });
			const list = await fs.readdir(src, { withFileTypes: true });
			
			const tasks = list.map(async (item) => {
				const s = path.join(src, item.name);
				const d = path.join(dest, item.name);
				
				if (item.isDirectory()) {
					await fastSync(s, d);
				} else {
					const sStat = await fs.stat(s);
					let shouldCopy = false;

					if (!existsSync(d)) {
						shouldCopy = true;
					} else {
						const dStat = await fs.stat(d);
						if (sStat.mtimeMs > dStat.mtimeMs || dStat.size === 0) {
							shouldCopy = true;
						}
					}

					if (shouldCopy) {
						let retries = 3;
						while (retries > 0) {
							try {
								await fs.copyFile(s, d);
								const finalStat = await fs.stat(d);
								if (item.name.endsWith(".jar") && finalStat.size === 0 && sStat.size > 0) {
									throw new Error("Zero byte copy detected");
								}
								await fs.utimes(d, sStat.atime, sStat.mtime);
								break;
							} catch (e) {
								retries--;
								if (retries === 0) {
									Logger.warn(`Failed to copy ${item.name} after retries.`);
								} else {
									await new Promise(r => setTimeout(r, 100));
								}
							}
						}
					}
				}
			});

			await Promise.all(tasks);
		};

		await fastSync(sourceDir, destDir);
		return appFolder;
	}

	async deployToWebapps(): Promise<{ path: string, finalName: string, isDirectory: boolean }> {
		Logger.step("Searching for generated artifacts");
		
		const artifact = this.projectService.getArtifact();

		if (!this.projectConfig.quiet) {
			Logger.info(artifact.isDirectory ? "Exploded Dir" : "Artifact", path.basename(artifact.path));
			if (this.projectConfig.appName) Logger.info("Deploy as", artifact.name);
		}
		
		return { path: artifact.path, finalName: artifact.name, isDirectory: artifact.isDirectory };
	}
}
