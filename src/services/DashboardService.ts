import { Logger } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";
import { 
	MAX_LOG_SCROLLBUFFER, 
	DASHBOARD_REFRESH_INTERVAL_MS,
	DASHBOARD_LOG_SLICE_LINES 
} from "../utils/constants";
import type { AppConfig } from "../types/config";
import os from "os";

const C = Logger.C;

export class DashboardService {
	private isTui: boolean;
	private logLines: string[] = [];
	private maxLogLines: number = 0;
	private status: string = "idle";
	private statusColor: string = C.gray;
	private gitContext: { branch: string; hash: string } | null = null;
	private actions: Map<string, () => void> = new Map();
	private startTime = Date.now();

	constructor(private config: AppConfig) {
		this.isTui = config.project.tui;
		if (this.isTui) {
			this.gitContext = Logger.getGitContext();
			this.maxLogLines = process.stdout.rows - 8;
			this.setupTui();
			this.registerShutdownHandlers();
		}
	}

	private registerShutdownHandlers() {
		const processManager = ProcessManager.getInstance();
		processManager.onShutdown(() => {
			this.restoreTerminal();
		});
	}

	private restoreTerminal() {
		if (this.isTui) {
			process.stdout.write("\x1B[?1049l");
			process.stdout.write("\x1B[?25h");
			process.stdin.setRawMode(false);
			process.stdin.pause();
		}
	}

	public isTuiActive(): boolean {
		return this.isTui;
	}

	public onAction(key: string, callback: () => void) {
		this.actions.set(key.toLowerCase(), callback);
	}

	private setupTui() {
		process.stdout.write("\x1B[?1049h");
		process.stdout.write("\x1B[2J");
		process.stdout.write("\x1B[?25l");
		
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		process.stdin.on("data", (key: string) => {
			const input = key.toLowerCase();
			if (key === "\u0003" || input === "q") {
				this.exit();
			}
			if (input === "l") {
				this.logLines = [];
				this.render();
			}
			
			const action = this.actions.get(input);
			if (action) action();
		});

		process.on("SIGINT", () => this.exit());
		process.on("exit", () => this.exit());

		setInterval(() => this.render(), DASHBOARD_REFRESH_INTERVAL_MS);
	}

	public setStatus(status: string, type: 'idle' | 'building' | 'ready' | 'error' = 'idle') {
		this.status = status;
		switch (type) {
			case 'building':
				this.statusColor = C.primary;
				break;
			case 'ready':
				this.statusColor = C.success;
				break;
			case 'error':
				this.statusColor = C.error;
				break;
			default:
				this.statusColor = C.gray;
		}
		this.render();
	}

	public spinner(msg: string) {
		const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
		let i = 0;
		
		this.setStatus(msg, 'building');
		
		const timer = setInterval(() => {
			this.status = `${frames[i]} ${msg}`;
			i = (i + 1) % frames.length;
			this.render();
		}, 80);

		return (success = true) => {
			clearInterval(timer);
			if (success) {
				this.setStatus('ready', 'ready');
			} else {
				this.setStatus('error', 'error');
			}
		};
	}

	public log(message: string) {
		if (!message) return;
		
		if (this.isTui) {
			const lines = message.split("\n");
			this.logLines.push(...lines);
			if (this.logLines.length > MAX_LOG_SCROLLBUFFER) {
				this.logLines = this.logLines.slice(-DASHBOARD_LOG_SLICE_LINES);
			}
			this.render();
		} else {
			console.log(message);
		}
	}

	private render() {
		if (!this.isTui) return;

		this.maxLogLines = process.stdout.rows - 8;
		
		const projectName = (process.cwd().split(/[/\\]/).pop() || "project").toLowerCase();
		const uptime = Math.floor((Date.now() - this.startTime) / 1000);
		const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m ${uptime % 60}s`;
		
		const mem = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024 * 10) / 10;
		const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
		
		// Header minimalista
		let output = "\x1B[H";
		output += `${C.gray}┌─ ${C.primary}${C.bold}XAVVA${C.reset}${C.gray}.${C.reset}${projectName}${C.reset}`;
		output += ` ${C.gray}│${C.reset} ${this.statusColor}${this.status}${C.reset}\x1B[K\n`;
		
		// Info bar
		const infos: string[] = [];
		if (this.config.project.profile) infos.push(`${C.warning}${this.config.project.profile}${C.reset}`);
		if (this.gitContext?.branch) infos.push(`${C.secondary}git:${this.gitContext.branch}${C.reset}`);
		infos.push(`${C.gray}mem:${mem}/${totalMem}GB${C.reset}`);
		infos.push(`${C.gray}up:${uptimeStr}${C.reset}`);
		
		output += `${C.gray}│${C.reset}  ${infos.join(` ${C.gray}•${C.reset} `)}\x1B[K\n`;
		output += `${C.gray}├────────────────────────────────────────────────────────┤${C.reset}\x1B[K\n`;

		// Logs
		const visibleLogs = this.logLines.slice(-this.maxLogLines);
		for (let i = 0; i < this.maxLogLines; i++) {
			const line = visibleLogs[i] || "";
			output += `${C.gray}│${C.reset} ${line.substring(0, process.stdout.columns - 3)}\x1B[K\n`;
		}

		// Footer minimalista
		output += `${C.gray}├────────────────────────────────────────────────────────┤${C.reset}\x1B[K\n`;
		output += `${C.gray}│${C.reset}  ${C.white}[r]${C.reset}${C.gray}estart  ${C.white}[l]${C.reset}${C.gray}og clear  ${C.white}[q]${C.reset}${C.gray}uit${C.reset}\x1B[K\n`;
		output += `${C.gray}└────────────────────────────────────────────────────────┘${C.reset}\x1B[K`;

		process.stdout.write(output);
	}

	private async exit() {
		this.restoreTerminal();
		await ProcessManager.getInstance().shutdown(0);
	}
}
