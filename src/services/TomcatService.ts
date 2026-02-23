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

	start(cleanLogs: boolean = false, debug: boolean = false, skipScan: boolean = false, quiet: boolean = false) {
		const binPath = `${this.activeConfig.path}\\bin\\catalina.bat`;
		const args = debug ? ["jpda", "run"] : ["run"];
		
		const catalinaOpts = [process.env.CATALINA_OPTS || ""];
		
		if (skipScan) {
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

		if (debug) {
			Logger.warn("🐞 Java Debugger habilitado na porta 5005");
			env.JPDA_ADDRESS = "5005";
			env.JPDA_TRANSPORT = "dt_socket";
		}

		if (cleanLogs || quiet) {
			this.stopStartupSpinner = Logger.spinner("Starting Tomcat server");
		}

		this.currentProcess = Bun.spawn([binPath, ...args], {
			stdout: "pipe",
			stderr: "pipe",
			env: env
		});

		this.pid = this.currentProcess.pid;

		this.processLogStream(this.currentProcess.stdout, cleanLogs, quiet);
		this.processLogStream(this.currentProcess.stderr, cleanLogs, quiet);
	}

	private async processLogStream(stream: ReadableStream, clean: boolean, quiet: boolean) {
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

				if (clean) {
					if (quiet && !Logger.isEssential(cleanLine)) {
						if (Logger.isSystemNoise(cleanLine)) continue;
						if (cleanLine.includes("INFO")) continue;
					} else if (Logger.isSystemNoise(cleanLine)) {
						continue;
					}

					if (this.activeConfig.grep && !cleanLine.toLowerCase().includes(this.activeConfig.grep.toLowerCase())) {
						if (!Logger.isEssential(cleanLine)) continue;
					}
					
					const summarized = Logger.summarize(cleanLine);
					console.log(summarized);
				} else {
					console.log(cleanLine);
				}
			}
		}
	}
}
