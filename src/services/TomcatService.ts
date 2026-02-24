import type { TomcatConfig } from "../types/config";
import { Logger } from "../utils/ui";

export class TomcatService {
	private activeConfig: TomcatConfig;
	private currentProcess: any = null;
	private stopStartupSpinner?: (success?: boolean) => void;
	public onReady?: () => void;
	private pid: number | null = null;

	constructor(customConfig: TomcatConfig) {
		this.activeConfig = customConfig;
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

	clearWebapps(appName?: string) {
		const fs = require("fs");
		const path = require("path");
		const webappsPath = path.join(this.activeConfig.path, "webapps");
		const workPath = path.join(this.activeConfig.path, "work");
		const tempPath = path.join(this.activeConfig.path, "temp");

		try {
			[workPath, tempPath].forEach(p => {
				if (fs.existsSync(p)) {
					fs.rmSync(p, { recursive: true, force: true });
					fs.mkdirSync(p);
				}
			});

			const files = fs.readdirSync(webappsPath);
			for (const file of files) {
				const fullPath = path.join(webappsPath, file);
				if (file === "ROOT" || file === "manager" || file === "host-manager") continue;
				
				fs.rmSync(fullPath, { recursive: true, force: true });
			}
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
		const fs = require("fs");
		const path = require("path");
		const os = require("os");
		const agentDir = path.join(os.homedir(), ".xavva", "agents");
		const agentPath = path.join(agentDir, "hotswap-agent-2.0.3.jar");

		if (fs.existsSync(agentPath) && fs.statSync(agentPath).size > 1000) return agentPath;

		try {
			if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
			
			Logger.step("Downloading HotswapAgent v2.0.3 (Global)...");
			const url = "https://github.com/HotswapProjects/HotswapAgent/releases/download/RELEASE-2.0.3/hotswap-agent-2.0.3.jar";
			const response = await fetch(url);
			if (!response.ok) throw new Error(`Status: ${response.status}`);
			
			const buffer = await response.arrayBuffer();
			fs.writeFileSync(agentPath, Buffer.from(buffer));
			Logger.success("HotswapAgent v2.0.3 installed globally!");
			return agentPath;
		} catch (e) {
			Logger.warn("Falha ao baixar HotswapAgent. Usando hot swap padrão da JVM.");
			return null;
		}
	}

	private findAllClassPaths(buildTool: 'maven' | 'gradle'): string[] {
		const fs = require("fs");
		const path = require("path");
		const results: string[] = [];
		const root = process.cwd();

		const scan = (dir: string) => {
			try {
				const files = fs.readdirSync(dir, { withFileTypes: true });
				for (const file of files) {
					if (!file.isDirectory()) continue;
					
					const name = file.name;
					if (name.startsWith('.') || ['node_modules', 'out', 'bin', 'src', 'webapps', '.xavva'].includes(name)) continue;

					const fullPath = path.join(dir, name);
					
					const isMavenClasses = buildTool === 'maven' && name === 'classes' && dir.endsWith('target');
					const isGradleClasses = buildTool === 'gradle' && name === 'main' && dir.endsWith(path.join('classes', 'java'));
					
					if (isMavenClasses || isGradleClasses) {
						results.push(fullPath.replace(/\\/g, "/"));
					} else {
						scan(fullPath);
					}
				}
			} catch (e) {}
		};

		scan(root);
		
		if (results.length === 0) {
			const defaultPath = buildTool === 'maven' 
				? path.join(root, "target", "classes")
				: path.join(root, "build", "classes", "java", "main");
			results.push(defaultPath.replace(/\\/g, "/"));
		}

		return results;
	}

	async start(config: any, isWatching: boolean = false) {
		const binPath = `${this.activeConfig.path}\\bin\\catalina.bat`;
		const args = (config.project.debug || isWatching) ? ["jpda", "run"] : ["run"];
		
		const catalinaOpts = [process.env.CATALINA_OPTS || ""];
		
		if (config.project.debug || isWatching) {
			const agentPath = await this.ensureHotswapAgent();
			if (agentPath) {
				catalinaOpts.push(`-javaagent:${agentPath}`);
				
				let javaBin = "java";
				if (process.env.JAVA_HOME) {
					javaBin = require("path").join(process.env.JAVA_HOME, "bin", "java.exe");
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
				
				const fs = require("fs");
				const path = require("path");
				const xavvaDir = path.join(process.cwd(), ".xavva");
				if (!fs.existsSync(xavvaDir)) fs.mkdirSync(xavvaDir, { recursive: true });
				
				const classPaths = this.findAllClassPaths(config.project.buildTool);
				const extraClasspath = classPaths.join(",");

				const propsPath = path.join(xavvaDir, "hotswap-agent.properties");
				const propsContent = `autoHotswap=true\nautoHotswap.delay=3000\nwatchResources=false\nextraClasspath=${extraClasspath}\nLOGGER=info`;
				fs.writeFileSync(propsPath, propsContent);
				
				catalinaOpts.push(`-Dhotswap-agent.properties.path=${propsPath}`);
			}
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

		const env: any = { 
			...process.env, 
			CATALINA_HOME: this.activeConfig.path,
			CATALINA_OPTS: catalinaOpts.join(" ").trim()
		};

		if (process.env.JAVA_HOME) {
			env.JAVA_HOME = process.env.JAVA_HOME;
			env.JRE_HOME = process.env.JAVA_HOME;
		}

		if (config.project.debug) {
			Logger.debug("Java Debugger habilitado na porta 5005");
			env.JPDA_ADDRESS = "5005";
			env.JPDA_TRANSPORT = "dt_socket";
		}

		if ((config.project.cleanLogs || config.project.quiet) && !config.project.verbose) {
			this.stopStartupSpinner = Logger.spinner("Starting Tomcat server");
		}

		this.currentProcess = Bun.spawn([binPath, ...args], {
			stdout: "pipe",
			stderr: "pipe",
			env: env
		});

		this.pid = this.currentProcess.pid;

		this.processLogStream(this.currentProcess.stdout, config.project.cleanLogs, config.project.quiet, config.project.verbose, config.tomcat.grep);
		this.processLogStream(this.currentProcess.stderr, config.project.cleanLogs, config.project.quiet, config.project.verbose, config.tomcat.grep);
	}

	private async processLogStream(stream: ReadableStream, clean: boolean, quiet: boolean, verbose: boolean, grep: string) {
		const reader = stream.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value);
			const lines = chunk.split(/[\r\n]+/);

			for (const line of lines) {
				const cleanLine = line.trim();
				if (!cleanLine || cleanLine.startsWith("Listening for transport")) continue;

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

				if (verbose) {
					Logger.log(cleanLine);
					continue;
				}

				if (clean) {
					if (quiet && !Logger.isEssential(cleanLine)) {
						if (Logger.isSystemNoise(cleanLine)) continue;
						if (cleanLine.includes("INFO")) continue;
					} else if (Logger.isSystemNoise(cleanLine)) {
						continue;
					}

					if (grep && !cleanLine.toLowerCase().includes(grep.toLowerCase())) {
						if (!Logger.isEssential(cleanLine)) continue;
					}
					
					const summarized = Logger.summarize(cleanLine);
					if (summarized) Logger.log(summarized);
				} else {
					Logger.log(cleanLine);
				}
			}
		}
	}
}
