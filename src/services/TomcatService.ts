import type { TomcatConfig, AppConfig } from "../types/config";
import { Logger } from "../utils/ui";
import type { Subprocess } from "bun";
import { ProjectService } from "./ProjectService";
import { existsSync, mkdirSync, writeFileSync, statSync, promises as fs } from "fs";
import path from "path";
import os from "os";

export class TomcatService {
	private activeConfig: TomcatConfig;
	private currentProcess: Subprocess | null = null;
	private stopStartupSpinner?: (success?: boolean) => void;
	public onReady?: () => void;
	private pid: number | null = null;
	private projectService: ProjectService | null = null;

	constructor(customConfig: TomcatConfig) {
		this.activeConfig = customConfig;
	}

	setProjectService(projectService: ProjectService) {
		this.projectService = projectService;
	}

	async getMemoryUsage(): Promise<string> {
		if (!this.pid) return "0 MB";
		try {
			const { stdout } = Bun.spawnSync(["powershell", "-command", `(Get-Process -Id ${this.pid}).WorkingSet64 / 1MB`]);
			const mem = await new Response(stdout).text();
			return `${Math.round(parseFloat(mem))} MB`;
		} catch (e) {
			return "N/A";
		}
	}

	async killConflict() {
		const { stdout } = Bun.spawnSync(["cmd", "/c", `netstat -ano | findstr :${this.activeConfig.port}`]);
		const output = await new Response(stdout).text();

		if (output) {
			const lines = output.trim().split('\n');
			const pid = lines[0].trim().split(/\s+/).pop();
			Logger.step(`Freeing port ${this.activeConfig.port}`);
			Bun.spawnSync(["taskkill", "/F", "/PID", pid]);
		}
	}

	async clearWebapps() {
		const webappsPath = path.join(this.activeConfig.path, "webapps");
		const workPath = path.join(this.activeConfig.path, "work");
		const tempPath = path.join(this.activeConfig.path, "temp");

		try {
			const cleanDir = async (p: string) => {
				if (existsSync(p)) {
					await fs.rm(p, { recursive: true, force: true });
					
					// Resiliência para Windows: garante que o diretório foi liberado antes do mkdir
					let retries = 10;
					while (retries > 0 && existsSync(p)) {
						await new Promise(r => setTimeout(r, 50));
						retries--;
					}
					
					await fs.mkdir(p, { recursive: true });
				}
			};

			const tasks: Promise<any>[] = [
				cleanDir(workPath),
				cleanDir(tempPath)
			];

			if (existsSync(webappsPath)) {
				const files = await fs.readdir(webappsPath);
				for (const file of files) {
					if (file === "ROOT" || file === "manager" || file === "host-manager") continue;
					const fullPath = path.join(webappsPath, file);
					tasks.push(fs.rm(fullPath, { recursive: true, force: true }));
				}
			}

			await Promise.all(tasks);
		} catch (e) {
			Logger.warn("Não foi possível limpar totalmente a pasta webapps ou cache.");
		}
	}

	stop() {
		if (this.currentProcess) {
			Logger.warn("Stopping active server...");
			this.currentProcess.kill();
			this.currentProcess = null;
		}
	}

	private async ensureHotswapAgent(): Promise<string | null> {
		const agentDir = path.join(os.homedir(), ".xavva", "agents");
		const agentPath = path.join(agentDir, "hotswap-agent-2.0.3.jar");

		if (existsSync(agentPath) && statSync(agentPath).size > 1000) return agentPath;

		try {
			if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });
			
			Logger.step("Downloading HotswapAgent v2.0.3 (Global)...");
			const url = "https://github.com/HotswapProjects/HotswapAgent/releases/download/RELEASE-2.0.3/hotswap-agent-2.0.3.jar";
			const response = await fetch(url);
			if (!response.ok) throw new Error(`Status: ${response.status}`);
			
			const buffer = await response.arrayBuffer();
			writeFileSync(agentPath, Buffer.from(buffer));
			Logger.success("HotswapAgent v2.0.3 installed globally!");
			return agentPath;
		} catch (e) {
			Logger.warn("Falha ao baixar HotswapAgent. Usando hot swap padrão da JVM.");
			return null;
		}
	}

	async start(config: AppConfig, isWatching: boolean = false) {
		const binPath = `${this.activeConfig.path}\\bin\\catalina.bat`;
		const args = (config.project.debug || isWatching) ? ["jpda", "run"] : ["run"];
		
		const catalinaOpts = [process.env.CATALINA_OPTS || ""];
		
		if (config.project.debug || isWatching) {
			const agentPath = await this.ensureHotswapAgent();
			if (agentPath) {
				catalinaOpts.push(`-javaagent:${agentPath}`);
				
				let javaBin = "java";
				if (process.env.JAVA_HOME) {
					javaBin = path.join(process.env.JAVA_HOME, "bin", "java.exe");
				}

				const javaVer = Bun.spawnSync([javaBin, "-version"]);
				const output = (javaVer.stderr.toString() + javaVer.stdout.toString()).toLowerCase();
				
				if (output.includes("dcevm") || output.includes("jbr") || output.includes("trava")) {
					catalinaOpts.push("-XX:+AllowEnhancedClassRedefinition");
				}

				catalinaOpts.push(
					"--add-opens=java.base/jdk.internal.loader=ALL-UNNAMED",
					"--add-opens=java.base/java.lang=ALL-UNNAMED",
					"--add-opens=java.base/java.io=ALL-UNNAMED",
					"--add-opens=java.base/java.net=ALL-UNNAMED",
					"--add-opens=java.base/java.util=ALL-UNNAMED",
					"--add-opens=java.base/java.util.concurrent=ALL-UNNAMED",
					"--add-opens=java.base/java.security=ALL-UNNAMED",
					"--add-opens=java.base/jdk.internal.reflect=ALL-UNNAMED",
					"--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
					"--add-opens=java.base/sun.nio.ch=ALL-UNNAMED",
					"--add-opens=java.base/java.util.jar=ALL-UNNAMED",
					"--add-opens=java.desktop/java.beans=ALL-UNNAMED"
				);
				

				const xavvaDir = path.join(process.cwd(), ".xavva");
				if (!existsSync(xavvaDir)) mkdirSync(xavvaDir, { recursive: true });
				
				const propsPath = path.join(xavvaDir, "hotswap-agent.properties");
				const propsContent = `autoHotswap=true\nautoHotswap.delay=500\nwatchResources=false\nLOGGER=info`;
				writeFileSync(propsPath, propsContent);
				
				catalinaOpts.push(`-Dhotswap-agent.properties.path=${propsPath}`);

				if (this.projectService) {
					const classPaths = this.projectService.findAllClassPaths();
					if (classPaths.length > 0) {
						catalinaOpts.push(`-Dhotswap.extraClasspath=${classPaths.join(",")}`);
					}
				}
			}
		}

		// Otimizações para JSP e Debug de JSP
		catalinaOpts.push(
			"-Dorg.apache.jasper.compiler.development=true",
			"-Dorg.apache.jasper.compiler.disableSmap=false",
			"-Dorg.apache.jasper.compiler.classdebuginfo=true"
		);

		if (config.project.encoding) {
			catalinaOpts.push(`-Dfile.encoding=${config.project.encoding}`);
		}

		if (config.project.skipScan) {
			catalinaOpts.push(
				"-Dtomcat.util.scan.StandardJarScanFilter.jarsToSkip=*.jar",
				"-Dtomcat.util.scan.StandardJarScanFilter.jarsToScan=",
				"-Dorg.apache.catalina.startup.ContextConfig.jarsToSkip=*.jar",
				"-Dorg.apache.catalina.startup.TldConfig.jarsToSkip=*.jar",
				"-Dorg.apache.tomcat.util.scan.StandardJarScanFilter.jarsToSkip=*.jar",
				"-Dorg.apache.catalina.startup.ContextConfig.jarsToScan=" 
			);
		}

		const env: Record<string, string | undefined> = { 
			...process.env, 
			CATALINA_HOME: this.activeConfig.path,
			CATALINA_OPTS: catalinaOpts.join(" ").trim()
		};

		if (process.env.JAVA_HOME) {
			env.JAVA_HOME = process.env.JAVA_HOME;
			env.JRE_HOME = process.env.JAVA_HOME;
		}

		if (config.project.debug) {
			Logger.debug(`Java Debugger habilitado na porta ${config.project.debugPort}`);
			env.JPDA_ADDRESS = String(config.project.debugPort);
			env.JPDA_TRANSPORT = "dt_socket";
		}

		if ((config.project.cleanLogs || config.project.quiet) && !config.project.verbose) {
			this.stopStartupSpinner = Logger.spinner("Starting Tomcat server");
		}

		this.currentProcess = Bun.spawn([binPath, ...args], {
			stdout: "pipe",
			stderr: "pipe",
			env: env as any
		});

		this.pid = this.currentProcess.pid;

		if (this.currentProcess.stdout) {
			this.processLogStream(this.currentProcess.stdout as any, config.project.cleanLogs, config.project.quiet, config.project.verbose, config.tomcat.grep || "");
		}
		if (this.currentProcess.stderr) {
			this.processLogStream(this.currentProcess.stderr as any, config.project.cleanLogs, config.project.quiet, config.project.verbose, config.tomcat.grep || "");
		}
	}

	private async processLogStream(stream: ReadableStream, clean: boolean, quiet: boolean, verbose: boolean, grep: string) {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() || ""; // Keep incomplete line in buffer

			for (const line of lines) {
				const cleanLine = line.trim();
				if (!cleanLine || cleanLine.startsWith("Listening for transport")) continue;

				// Detect startup completion
				if (cleanLine.includes("Server startup in") || cleanLine.includes("SEVERE") || cleanLine.includes("Exception")) {
					const isSuccess = cleanLine.includes("Server startup in");
					if (this.stopStartupSpinner) {
						this.stopStartupSpinner(isSuccess);
						this.stopStartupSpinner = undefined;
					}
					if (isSuccess && this.onReady) {
						this.onReady();
					}
				}

				// Verbose: formata logs do Tomcat
				if (verbose) {
					if (Logger.isTomcatNoise(cleanLine)) {
						continue; // Silencia noise completamente
					}
					const formatted = Logger.formatTomcatLog(cleanLine);
					if (formatted) {
						console.log(formatted);
					}
					continue;
				}

				// Clean mode: filtra noise
				if (clean) {
					// Sempre filtra noise do sistema
					if (Logger.isSystemNoise(cleanLine)) continue;

					// Quiet mode: só mostra essencial
					if (quiet && !Logger.isEssential(cleanLine)) {
						if (cleanLine.includes("INFO") && !cleanLine.includes("ERROR")) continue;
					}

					// Grep filter
					if (grep && !cleanLine.toLowerCase().includes(grep.toLowerCase())) {
						if (!Logger.isEssential(cleanLine)) continue;
					}
					
					const summarized = Logger.summarize(cleanLine);
					if (summarized) {
						// Só mostra se não for vazio (rate limiting)
						if (summarized.trim()) Logger.log(summarized);
					}
				} else {
					// Non-clean: mostra tudo mas formata
					if (Logger.isSystemNoise(cleanLine)) {
						// Silencia completamente noise em non-clean também
						continue;
					}
					Logger.log(cleanLine);
				}
			}
		}
	}
}
