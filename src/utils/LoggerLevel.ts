import { Logger } from "./ui";

export type LogLevel = "silent" | "error" | "warn" | "info" | "verbose" | "trace" | "silly";

interface LogLevelConfig {
    value: number;
    color: string;
    prefix: string;
}

export class LoggerLevel {
    private static currentLevel: LogLevel = "info";
    private static readonly levels: Record<LogLevel, LogLevelConfig> = {
        silent: { value: 0, color: "", prefix: "" },
        error: { value: 1, color: Logger.C.error, prefix: "ERR" },
        warn: { value: 2, color: Logger.C.warning, prefix: "WRN" },
        info: { value: 3, color: Logger.C.info, prefix: "INF" },
        verbose: { value: 4, color: Logger.C.primary, prefix: "VRB" },
        trace: { value: 5, color: Logger.C.gray, prefix: "TRC" },
        silly: { value: 6, color: Logger.C.darkGray, prefix: "SLY" },
    };

    static setLevel(level: LogLevel): void {
        this.currentLevel = level;
    }

    static getLevel(): LogLevel {
        return this.currentLevel;
    }

    static shouldLog(level: LogLevel): boolean {
        return this.levels[level].value <= this.levels[this.currentLevel].value;
    }

    private static log(level: LogLevel, message: string, ...args: unknown[]): void {
        if (!this.shouldLog(level)) return;
        
        const config = this.levels[level];
        const formatted = args.length > 0 
            ? this.formatMessage(message, args)
            : message;
        
        if (level === "error") {
            Logger.error(formatted);
        } else if (level === "warn") {
            Logger.warn(formatted);
        } else {
            console.log(`${Logger.C.gray}│${Logger.C.reset}  ${config.color}[${config.prefix}]${Logger.C.reset} ${formatted}`);
        }
    }

    private static formatMessage(message: string, args: unknown[]): string {
        return args.reduce((msg, arg, index) => {
            const placeholder = `%${index + 1}`;
            const str = typeof arg === "object" 
                ? JSON.stringify(arg, null, 2)
                : String(arg);
            return msg.replace(placeholder, str);
        }, message);
    }

    // Public logging methods
    static error(message: string, ...args: unknown[]): void {
        this.log("error", message, ...args);
    }

    static warn(message: string, ...args: unknown[]): void {
        this.log("warn", message, ...args);
    }

    static info(message: string, ...args: unknown[]): void {
        this.log("info", message, ...args);
    }

    static verbose(message: string, ...args: unknown[]): void {
        this.log("verbose", message, ...args);
    }

    static trace(message: string, ...args: unknown[]): void {
        this.log("trace", message, ...args);
    }

    static silly(message: string, ...args: unknown[]): void {
        this.log("silly", message, ...args);
    }

    // Utility methods for specific debug scenarios
    static debugCommand(command: string, args: string[]): void {
        if (this.shouldLog("verbose")) {
            this.verbose("Executing: %1 %2", command, args.join(" "));
        }
    }

    static debugSpawn(cmd: string, options: Record<string, unknown>): void {
        if (this.shouldLog("trace")) {
            this.trace("Spawn: %1 with options: %2", cmd, options);
        }
    }

    static debugHttp(method: string, url: string, status?: number): void {
        if (this.shouldLog("verbose")) {
            const statusStr = status !== undefined ? ` -> ${status}` : "";
            this.verbose("HTTP %1 %2%3", method.toUpperCase(), url, statusStr);
        }
    }

    static debugFile(operation: string, path: string, details?: unknown): void {
        if (this.shouldLog("trace")) {
            this.trace("File %1: %2 %3", operation, path, details || "");
        }
    }

    static debugConfig(key: string, value: unknown): void {
        if (this.shouldLog("silly")) {
            this.silly("Config: %1 = %2", key, value);
        }
    }

    static debugPerformance(operation: string, durationMs: number): void {
        if (this.shouldLog("verbose")) {
            this.verbose("Performance: %1 took %2ms", operation, durationMs);
        }
    }

    static debugTiming(label: string): () => void {
        if (!this.shouldLog("verbose")) {
            return () => {}; // No-op
        }
        
        const start = performance.now();
        this.verbose("Timing started: %1", label);
        
        return () => {
            const duration = Math.round(performance.now() - start);
            this.verbose("Timing ended: %1 took %2ms", label, duration);
        };
    }
}
