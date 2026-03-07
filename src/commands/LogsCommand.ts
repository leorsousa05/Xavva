import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { DashboardService } from "../services/DashboardService";
import { LogAnalyzer } from "../services/LogAnalyzer";
import { Logger } from "../utils/ui";
import path from "path";
import fs from "fs";

export class LogsCommand implements Command {
    constructor(private dashboard?: DashboardService, private logAnalyzer?: LogAnalyzer) {}

    async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
        const logPath = path.join(config.tomcat.path, "logs", "catalina.out");

        if (!fs.existsSync(logPath)) {
            const errorMsg = `Arquivo de log não encontrado: ${logPath}`;
            if (this.dashboard) this.dashboard.log(Logger.C.red + errorMsg);
            else Logger.error(errorMsg);
            return;
        }

        const analyzer = this.logAnalyzer || new LogAnalyzer(config.project);
        const dashboard = this.dashboard || new DashboardService(config);

        dashboard.setStatus("LOGGING", Logger.C.green);
        
        if (args?.grep) {
            dashboard.log(`${Logger.C.dim}Filter:${Logger.C.reset} ${Logger.C.bold}${args.grep}${Logger.C.reset}`);
        }

        const stats = fs.statSync(logPath);
        let currentSize = stats.size;

        fs.watch(logPath, (event) => {
            if (event === "change") {
                const newStats = fs.statSync(logPath);
                if (newStats.size > currentSize) {
                    const stream = fs.createReadStream(logPath, {
                        start: currentSize,
                        end: newStats.size
                    });

                    stream.on("data", (chunk) => {
                        const lines = chunk.toString().split("\n");
                        lines.forEach(line => {
                            if (!line.trim()) return;
                            
                            const grep = args?.grep || config.project.grep;
                            if (grep && !line.toLowerCase().includes(grep.toLowerCase())) {
                                return;
                            }

                            const formatted = analyzer.summarize(line);
                            if (formatted) {
                                dashboard.log(formatted);
                            }
                        });
                    });

                    currentSize = newStats.size;
                } else if (newStats.size < currentSize) {
                    currentSize = newStats.size;
                    dashboard.log(Logger.C.warning + "Arquivo de log foi resetado/rotacionado.");
                }
            }
        });

        return new Promise(() => {});
    }
}
