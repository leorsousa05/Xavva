/**
 * ErrorHandler centralizado
 * Trata todos os erros do aplicativo de forma uniforme
 */

import { 
    XavvaError, 
    isOperationalError, 
    getExitCode,
    NetworkError,
    FileSystemError,
    BuildError,
    TomcatError,
    ConfigError
} from "./XavvaError";
import { Logger } from "../logging";
import { ProcessManager } from "../utils/processManager";

export interface ErrorReport {
    error: Error;
    code: string;
    exitCode: number;
    isOperational: boolean;
    context?: Record<string, unknown>;
    timestamp: Date;
}

export class ErrorHandler {
    private static instance: ErrorHandler;
    private errorHistory: ErrorReport[] = [];
    private maxHistorySize = 10;
    private isShuttingDown = false;
    private logger = Logger.getInstance();

    private constructor() {}

    static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    /**
     * Trata qualquer erro de forma apropriada
     */
    async handle(error: unknown, context?: Record<string, unknown>): Promise<void> {
        if (this.isShuttingDown) return;

        const normalizedError = this.normalizeError(error);
        const report = this.createReport(normalizedError, context);
        
        // Adiciona ao histórico
        this.addToHistory(report);

        // Log apropriado baseado no tipo de erro
        if (normalizedError instanceof XavvaError) {
            this.handleXavvaError(normalizedError);
        } else {
            this.handleUnexpectedError(normalizedError);
        }

        // Se não for erro operacional, mostra stack trace em verbose
        if (!report.isOperational) {
            this.logger.debug("Stack trace:");
            this.logger.debug(normalizedError.stack || "N/A");
        }

        // Shutdown com código apropriado
        const processManager = ProcessManager.getInstance();
        await processManager.shutdown(report.exitCode);
    }

    /**
     * Trata erro sem fazer shutdown (para operações que podem continuar)
     */
    handleGraceful(error: unknown, context?: Record<string, unknown>): ErrorReport {
        const normalizedError = this.normalizeError(error);
        const report = this.createReport(normalizedError, context);
        
        this.addToHistory(report);

        if (normalizedError instanceof XavvaError) {
            this.logXavvaError(normalizedError, false);
        } else {
            this.logger.warn(`Erro inesperado: ${normalizedError.message}`);
        }

        return report;
    }

    /**
     * Normaliza qualquer valor para Error
     */
    private normalizeError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }
        
        if (typeof error === "string") {
            return new Error(error);
        }
        
        if (error && typeof error === "object" && "message" in error) {
            return new Error(String((error as { message: unknown }).message));
        }
        
        return new Error("Erro desconhecido");
    }

    /**
     * Cria um relatório de erro estruturado
     */
    private createReport(error: Error, context?: Record<string, unknown>): ErrorReport {
        return {
            error,
            code: error instanceof XavvaError ? error.code : "UNKNOWN_ERROR",
            exitCode: getExitCode(error),
            isOperational: isOperationalError(error),
            context,
            timestamp: new Date(),
        };
    }

    /**
     * Adiciona erro ao histórico (com limite)
     */
    private addToHistory(report: ErrorReport): void {
        this.errorHistory.push(report);
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory.shift();
        }
    }

    /**
     * Trata erros específicos do Xavva
     */
    private handleXavvaError(error: XavvaError): void {
        this.logXavvaError(error, true);
    }

    /**
     * Loga erro Xavva com formatação adequada
     */
    private logXavvaError(error: XavvaError, isFatal: boolean): void {
        const logMethod = isFatal ? this.logger.error.bind(this.logger) : this.logger.warn.bind(this.logger);
        
        // Cabeçalho do erro
        logMethod(error.message);
        
        // Detalhes adicionais se houver
        if (error instanceof NetworkError) {
            this.logger.info("Dica: Verifique sua conexão de internet e tente novamente");
        } else if (error instanceof FileSystemError) {
            this.logger.info("Dica: Verifique as permissões do arquivo/diretório");
        } else if (error instanceof BuildError) {
            this.logger.info("Dica: Use --verbose para ver detalhes completos do build");
        } else if (error instanceof TomcatError) {
            this.logger.info("Dica: Verifique se o Tomcat está configurado corretamente");
        } else if (error instanceof ConfigError) {
            this.logger.info("Dica: Verifique seu arquivo xavva.json");
        }

        // Código do erro em debug
        this.logger.debug(`Código do erro: ${error.code} (exit ${error.exitCode})`);
    }

    /**
     * Trata erros inesperados (bugs)
     */
    private handleUnexpectedError(error: Error): void {
        this.logger.error("Erro inesperado:");
        this.logger.error(error.message);
        this.logger.newline();
        this.logger.info("Isso parece ser um bug", "Por favor, reporte em github.com/leorsousa05/Xavva/issues");
        
        // Sempre mostra stack trace para erros inesperados
        if (error.stack) {
            this.logger.newline();
            this.logger.debug("Stack trace:");
            const lines = error.stack.split("\n").slice(1, 5);
            for (const line of lines) {
                this.logger.debug(line.trim());
            }
        }
    }

    /**
     * Obtém histórico de erros
     */
    getErrorHistory(): ErrorReport[] {
        return [...this.errorHistory];
    }

    /**
     * Limpa histórico de erros
     */
    clearHistory(): void {
        this.errorHistory = [];
    }

    /**
     * Verifica se houve erros recentes de um tipo específico
     */
    hasRecentError(code: string, withinMs: number = 60000): boolean {
        const now = Date.now();
        return this.errorHistory.some(
            report => 
                report.code === code && 
                (now - report.timestamp.getTime()) < withinMs
        );
    }

    /**
     * Wrapper para executar função com tratamento de erro automático
     */
    async wrap<T>(
        fn: () => Promise<T>, 
        context?: Record<string, unknown>
    ): Promise<T | undefined> {
        try {
            return await fn();
        } catch (error) {
            await this.handle(error, context);
            return undefined;
        }
    }

    /**
     * Wrapper para executar função sem shutdown em caso de erro
     */
    wrapGraceful<T>(
        fn: () => T, 
        fallback: T,
        context?: Record<string, unknown>
    ): T {
        try {
            return fn();
        } catch (error) {
            this.handleGraceful(error, context);
            return fallback;
        }
    }
}

// Helper para uso rápido
export function handleError(error: unknown, context?: Record<string, unknown>): Promise<void> {
    return ErrorHandler.getInstance().handle(error, context);
}

export function handleGraceful(error: unknown, context?: Record<string, unknown>): ErrorReport {
    return ErrorHandler.getInstance().handleGraceful(error, context);
}
