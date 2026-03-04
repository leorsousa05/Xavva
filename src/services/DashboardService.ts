import { Logger } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";
import { 
    MAX_LOG_SCROLLBUFFER, 
    DASHBOARD_REFRESH_INTERVAL_MS,
    DASHBOARD_LOG_SLICE_LINES 
} from "../utils/constants";
import type { AppConfig } from "../types/config";
import os from "os";

export class DashboardService {
    private isTui: boolean;
    private logLines: string[] = [];
    private maxLogLines: number = 0;
    private status: string = "IDLE";
    private statusColor: string = Logger.C.dim;
    private gitContext: { branch: string; commit: string } | null = null;
    private actions: Map<string, () => void> = new Map();

    constructor(private config: AppConfig) {
        this.isTui = config.project.tui;
        if (this.isTui) {
            this.gitContext = Logger.getGitContext();
            this.maxLogLines = process.stdout.rows - 6;
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
            process.stdout.write("\x1B[?1049l"); // Restore buffer
            process.stdout.write("\x1B[?25h"); // Show cursor
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
        process.stdout.write("\x1B[?1049h"); // Switch to alternate buffer
        process.stdout.write("\x1B[2J"); // Clear screen
        process.stdout.write("\x1B[?25l"); // Hide cursor
        
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding("utf8");

        process.stdin.on("data", (key: string) => {
            const input = key.toLowerCase();
            // Ctrl+C ou Q para sair
            if (key === "\u0003" || input === "q") {
                this.exit();
            }
            if (input === "l") {
                this.logLines = [];
                this.render();
                return;
            }
            
            const action = this.actions.get(input);
            if (action) action();
        });

        process.on("SIGINT", () => this.exit());
        process.on("exit", () => this.exit());

        // Atualiza o dashboard periodicamente para memória/status
        setInterval(() => this.render(), 1000);
    }

    public setStatus(status: string, color: string = Logger.C.cyan) {
        this.status = status;
        this.statusColor = color;
        this.render();
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

        this.maxLogLines = process.stdout.rows - 6;
        
        let output = "\x1B[H"; // Move to 0,0
        
        // Header
        const name = (process.cwd().split(/[/\\]/).pop() || "PROJECT").toUpperCase();
        const mem = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024 * 10) / 10;
        const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
        const profile = this.config.project.profile ? ` ${Logger.C.dim}•${Logger.C.reset} ${Logger.C.yellow}♦ ${this.config.project.profile.toUpperCase()}${Logger.C.reset}` : "";

        output += `${Logger.C.bold}${Logger.C.cyan} X A V V A  2.0 ${Logger.C.reset} ${Logger.C.dim}│${Logger.C.reset} ${Logger.C.white}${Logger.C.bold}${name}${Logger.C.reset}${profile}\x1B[K\n`;
        output += `${Logger.C.dim} STATUS: ${this.statusColor}${this.status.padEnd(10)}${Logger.C.reset} ${Logger.C.dim}│ MEM: ${Logger.C.yellow}${mem}G/${totalMem}G${Logger.C.reset} ${Logger.C.dim}│ BRANCH: ${Logger.C.magenta}${this.gitContext?.branch || "unknown"}${Logger.C.reset}\x1B[K\n`;
        output += `${Logger.C.dim}──────────────────────────────────────────────────────────────────────────${Logger.C.reset}\x1B[K\n`;

        // Logs
        const visibleLogs = this.logLines.slice(-this.maxLogLines);
        for (let i = 0; i < this.maxLogLines; i++) {
            const line = visibleLogs[i] || "";
            output += line.substring(0, process.stdout.columns) + "\x1B[K\n";
        }

        // Footer
        output += `\x1B[${process.stdout.rows};1H`; // Move to last row
        output += ` ${Logger.C.bold}${Logger.C.white}R${Logger.C.reset} Restart  ${Logger.C.bold}${Logger.C.white}L${Logger.C.reset} Clear  ${Logger.C.bold}${Logger.C.white}Q${Logger.C.reset} Quit    ${Logger.C.dim} (Xavva 2.0 TUI Mode)${Logger.C.reset}\x1B[K`;

        process.stdout.write(output);
    }

    private async exit() {
        this.restoreTerminal();
        await ProcessManager.getInstance().shutdown(0);
    }
}
