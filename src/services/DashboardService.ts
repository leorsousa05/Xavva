import { Logger } from "../utils/ui";
import type { AppConfig } from "../types/config";
import os from "os";

export class DashboardService {
    private isTui: boolean;
    private logLines: string[] = [];
    private maxLogLines: number = 0;
    private status: string = "IDLE";
    private statusColor: string = Logger.C.dim;

    constructor(private config: AppConfig) {
        this.isTui = config.project.tui;
        if (this.isTui) {
            this.maxLogLines = process.stdout.rows - 10;
            this.setupTui();
        }
    }

    private setupTui() {
        process.stdout.write("\x1B[?1049h"); // Switch to alternate buffer
        process.stdout.write("\x1B[?25l"); // Hide cursor
        
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding("utf8");

        process.stdin.on("data", (key: string) => {
            // Ctrl+C ou Q para sair
            if (key === "\u0003" || key.toLowerCase() === "q") {
                this.exit();
            }
            if (key.toLowerCase() === "l") {
                this.logLines = [];
                this.render();
            }
        });

        process.on("SIGINT", () => this.exit());
        process.on("exit", () => this.exit());

        // Atualiza o dashboard periodicamente para memória/status
        setInterval(() => this.render(), 1000);
    }

    public onKey(key: string, callback: () => void) {
        process.stdin.on("data", (input: string) => {
            if (input.toLowerCase() === key.toLowerCase()) {
                callback();
            }
        });
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
            if (this.logLines.length > 1000) { // Limite de scrollbuffer
                this.logLines = this.logLines.slice(-1000);
            }
            this.render();
        } else {
            console.log(message);
        }
    }

    private render() {
        if (!this.isTui) return;

        this.maxLogLines = process.stdout.rows - 8;
        
        let output = "\x1B[H"; // Move to 0,0
        
        // Header
        const name = (process.cwd().split(/[/\\]/).pop() || "PROJECT").toUpperCase();
        const git = Logger.getGitContext();
        const mem = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024 * 10) / 10;
        const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);

        output += `${Logger.C.bold}${Logger.C.cyan} X A V V A  2.0 ${Logger.C.reset} ${Logger.C.dim}│${Logger.C.reset} ${Logger.C.white}${Logger.C.bold}${name}${Logger.C.reset}\n`;
        output += `${Logger.C.dim} STATUS: ${this.statusColor}${this.status.padEnd(10)}${Logger.C.reset} ${Logger.C.dim}│ MEM: ${Logger.C.yellow}${mem}G/${totalMem}G${Logger.C.reset} ${Logger.C.dim}│ BRANCH: ${Logger.C.magenta}${git.branch || "unknown"}${Logger.C.reset}\n`;
        output += `${Logger.C.dim}──────────────────────────────────────────────────────────────────────────${Logger.C.reset}\n`;

        // Logs
        const visibleLogs = this.logLines.slice(-this.maxLogLines);
        for (let i = 0; i < this.maxLogLines; i++) {
            const line = visibleLogs[i] || "";
            // Limpa a linha antes de escrever (ANSI escape EL)
            output += line.substring(0, process.stdout.columns) + "\x1B[K\n";
        }

        // Footer
        output += `\x1B[${process.stdout.rows - 1};1H`; // Move to last rows
        output += `${Logger.C.dim}──────────────────────────────────────────────────────────────────────────${Logger.C.reset}\n`;
        output += ` ${Logger.C.bold}${Logger.C.white}R${Logger.C.reset} Restart  ${Logger.C.bold}${Logger.C.white}L${Logger.C.reset} Clear  ${Logger.C.bold}${Logger.C.white}Q${Logger.C.reset} Quit    ${Logger.C.dim} (Xavva 2.0 TUI Mode)${Logger.C.reset}`;

        process.stdout.write(output);
    }

    private exit() {
        if (this.isTui) {
            process.stdout.write("\x1B[?1049l"); // Restore buffer
            process.stdout.write("\x1B[?25h"); // Show cursor
            process.stdin.setRawMode(false);
            process.stdin.pause();
        }
        process.exit(0);
    }
}
