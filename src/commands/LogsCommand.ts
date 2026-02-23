import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { Logger } from "../utils/ui";
import path from "path";
import fs from "fs";

export class LogsCommand implements Command {
    async execute(config: AppConfig): Promise<void> {
        const logPath = path.join(config.tomcat.path, "logs", "catalina.out");

        if (!fs.existsSync(logPath)) {
            Logger.error(`Arquivo de log não encontrado: ${logPath}`);
            return;
        }

        Logger.section(`Monitoring Logs: ${logPath}`);
        if (config.tomcat.grep) {
            Logger.info("Filter", config.tomcat.grep);
        }

        const stats = fs.statSync(logPath);
        let currentSize = stats.size;

        const colorize = (line: string): string => {
            if (line.match(/SEVERE|ERROR|Exception|Error/i)) return `\x1b[31m${line}\x1b[0m`;
            if (line.match(/WARNING|WARN/i)) return `\x1b[33m${line}\x1b[0m`;
            if (line.match(/INFO/i)) return `\x1b[36m${line}\x1b[0m`;
            if (line.match(/DEBUG/i)) return `\x1b[90m${line}\x1b[0m`;
            return line;
        };

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
                            
                            if (config.tomcat.grep && !line.toLowerCase().includes(config.tomcat.grep.toLowerCase())) {
                                return;
                            }

                            process.stdout.write(colorize(line) + "\n");
                        });
                    });

                    currentSize = newStats.size;
                } else if (newStats.size < currentSize) {
                    currentSize = newStats.size;
                    Logger.warn("Arquivo de log foi resetado/rotacionado.");
                }
            }
        });

        return new Promise(() => {});
    }
}
