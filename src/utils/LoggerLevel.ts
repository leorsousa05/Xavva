/**
 * LoggerLevel - Adaptador para o novo sistema de logging
 * 
 * @deprecated Use o Logger de src/logging/ diretamente
 */

import { Logger } from "../logging";

export type LogLevel = "silent" | "error" | "warn" | "info" | "verbose" | "trace" | "silly";

interface LogLevelConfig {
    value: number;
    color: string;
    prefix: string;
}

/**
 * @deprecated Use Logger de src/logging/
 * 
 * LoggerLevel - Adaptador que delega para o novo sistema de logging
 */
export class LoggerLevel {
    private static currentLevel: LogLevel = "info";
    private static logger = Logger.getInstance();
    
    private static readonly levels: Record<LogLevel, LogLevelConfig> = {
        silent: { value: 0, color: "", prefix: "" },
        error: { value: 1, color: Logger.getInstance()['config'].colors ? "\x1b[31m" : "", prefix: "ERR" },
        warn: { value: 2, color: Logger.getInstance()['config'].colors ? "\x1b[33m" : "", prefix: "WRN" },
        info: { value: 3, color: Logger.getInstance()['config'].colors ? "\x1b[34m" : "", prefix: "INF" },
        verbose: { value: 4, color: Logger.getInstance()['config'].colors ? "\x1b[36m" : "", prefix: "VRB" },
        trace: { value: 5, color: Logger.getInstance()['config'].colors ? "\x1b[90m" : "", prefix: "TRC" },
        silly: { value: 6, color: Logger.getInstance()['config'].colors ? "\x1b[38;5;240m" : "", prefix: "SLY" },
    };

    static setLevel(level: LogLevel): void {
        this.currentLevel = level;
        this.logger.setLevel(level);
    }

    static getLevel(): LogLevel {
        return this.currentLevel;
    }

    static shouldLog(level: LogLevel): boolean {
        return this.levels[level].value <= this.levels[this.currentLevel].value;
    }

    private static log(level: LogLevel, message: string, ...args: unknown[]): void {
        if (!this.shouldLog(level)) return;
        
        const formatted = args.length > 0 
            ? this.formatMessage(message, args)
            : message;
        
        switch (level) {
            case "error":
                this.logger.error(formatted);
                break;
            case "warn":
                this.logger.warn(formatted);
                break;
            case "info":
                this.logger.info(formatted);
                break;
            case "verbose":
                this.logger.debug(formatted);
                break;
            case "trace":
            case "silly":
                this.logger.trace(formatted);
                break;
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
            this.verbose("Executando: %1 %2", command, args.join(" "));
        }
    }

    static debugSpawn(cmd: string, options: Record<string, unknown>): void {
        if (this.shouldLog("trace")) {
            this.trace("Spawn: %1 com opções: %2", cmd, options);
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
            this.trace("Arquivo %1: %2 %3", operation, path, details || "");
        }
    }

    static debugConfig(key: string, value: unknown): void {
        if (this.shouldLog("silly")) {
            this.silly("Config: %1 = %2", key, value);
        }
    }

    static debugPerformance(operation: string, durationMs: number): void {
        if (this.shouldLog("verbose")) {
            this.verbose("Performance: %1 levou %2ms", operation, durationMs);
        }
    }

    static debugTiming(label: string): () => void {
        if (!this.shouldLog("verbose")) {
            return () => {}; // No-op
        }
        
        const start = performance.now();
        this.verbose("Timing iniciado: %1", label);
        
        return () => {
            const duration = Math.round(performance.now() - start);
            this.verbose("Timing finalizado: %1 levou %2ms", label, duration);
        };
    }
}
