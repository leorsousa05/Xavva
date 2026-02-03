import { config } from "../../config";

export class TomcatService {
	private activeConfig: any;

	constructor(customConfig?: any) {
		this.activeConfig = customConfig || config.tomcat;
	}

	async killConflict() {
		const { stdout } = Bun.spawnSync(["cmd", "/c", `netstat -ano | findstr :${this.activeConfig.port}`]);
		const output = await new Response(stdout).text();

		if (output) {
			const lines = output.trim().split('\n');
			const pid = lines[0].trim().split(/\s+/).pop();
			console.log(`[Tomcat] Liberando porta ${this.activeConfig.port}...`);
			Bun.spawnSync(["taskkill", "/F", "/PID", pid]);
		}
	}

	start(cleanLogs: boolean = false) {
		const binPath = `${this.activeConfig.path}\\bin\\catalina.bat`;

		const proc = Bun.spawn([binPath, "run"], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, CATALINA_HOME: this.activeConfig.path }
		});

		this.processLogStream(proc.stdout, cleanLogs);
		this.processLogStream(proc.stderr, cleanLogs);
	}

	private async processLogStream(stream: ReadableStream, clean: boolean) {
		const reader = stream.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value);
			const lines = chunk.split('\n');

			for (const line of lines) {
				const cleanLine = line.trim();
				if (!cleanLine) continue;

				if (clean) {
					if (this.isSystemNoise(cleanLine)) continue;
					console.log(this.summarize(cleanLine));
				} else {
					console.log(cleanLine);
				}
			}
		}
	}

	private isSystemNoise(line: string): boolean {
		return line.startsWith("Using ") || line.includes("Command line argument") || line.includes("VersionLoggerListener");
	}

	private summarize(line: string): string {
		let color = "";
		let label = "";

		if (line.includes("INFO")) { color = "\x1b[32m"; label = "INFO"; }
		else if (line.includes("WARNING")) { color = "\x1b[33m"; label = "WARN"; }
		else if (line.includes("SEVERE") || line.includes("ERROR")) { color = "\x1b[31m"; label = "ERR "; }
		else return line;

		const parts = line.split(/INFO|WARNING|SEVERE|ERROR/);
		if (parts.length > 1) {
			let msg = parts[1].split("] ").pop() || parts[1];
			msg = msg.replace(/^org\.apache\..*?\s/, "");
			return `${color}[${label}]\x1b[0m ${msg.trim()}`;
		}

		return line;
	}
}
