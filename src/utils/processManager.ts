/**
 * ProcessManager - Centraliza o controle do ciclo de vida da aplicação.
 * 
 * Evita chamadas diretas a process.exit() espalhadas pelo código,
 * facilitando testes e permitindo graceful shutdown.
 */

import { 
    EXIT_SUCCESS, 
    EXIT_GENERIC_ERROR, 
    EXIT_INVALID_COMMAND, 
    EXIT_BUILD_FAILED, 
    EXIT_DEPLOY_FAILED, 
    EXIT_SIGINT,
    TIMEOUT_SHUTDOWN_MS 
} from "./constants";

export type ExitCode = 
    | typeof EXIT_SUCCESS
    | typeof EXIT_GENERIC_ERROR
    | typeof EXIT_INVALID_COMMAND
    | typeof EXIT_BUILD_FAILED
    | typeof EXIT_DEPLOY_FAILED
    | typeof EXIT_SIGINT;

interface ShutdownHandler {
    (): Promise<void> | void;
}

export class ProcessManager {
    private static instance: ProcessManager;
    private shutdownHandlers: Set<ShutdownHandler> = new Set();
    private isShuttingDown = false;
    private exitCode: ExitCode = 0;

    private constructor() {
        this.setupSignalHandlers();
    }

    static getInstance(): ProcessManager {
        if (!ProcessManager.instance) {
            ProcessManager.instance = new ProcessManager();
        }
        return ProcessManager.instance;
    }

    /**
     * Registra um handler para ser executado no shutdown.
     * Útil para liberar recursos (fechar conexões, limpar arquivos temp, etc).
     */
    onShutdown(handler: ShutdownHandler): () => void {
        this.shutdownHandlers.add(handler);
        // Retorna função para remover o handler
        return () => this.shutdownHandlers.delete(handler);
    }

    /**
     * Define o código de saída sem encerrar imediatamente.
     * O código real será usado quando shutdown() for chamado.
     */
    setExitCode(code: ExitCode): void {
        this.exitCode = code;
    }

    /**
     * Obtém o código de saída atual.
     */
    getExitCode(): ExitCode {
        return this.exitCode;
    }

    /**
     * Executa graceful shutdown com todos os handlers registrados.
     * Por padrão chama process.exit(), mas pode ser mockado em testes.
     */
    async shutdown(code?: ExitCode): Promise<never> {
        if (this.isShuttingDown) {
            // Evita chamadas duplicadas
            return new Promise(() => {}) as never;
        }

        this.isShuttingDown = true;
        if (code !== undefined) {
            this.exitCode = code;
        }

        // Executa handlers em paralelo com timeout
        const timeoutMs = TIMEOUT_SHUTDOWN_MS;
        const handlerPromises = Array.from(this.shutdownHandlers).map(async (handler) => {
            try {
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Shutdown handler timeout')), timeoutMs)
                );
                await Promise.race([handler(), timeoutPromise]);
            } catch (e) {
                console.error('Erro em shutdown handler:', e);
            }
        });

        await Promise.all(handlerPromises);

        // Em ambiente de teste, não chama process.exit()
        if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
            throw new ProcessExitError(this.exitCode);
        }

        process.exit(this.exitCode);
    }

    /**
     * Encerra imediatamente sem graceful shutdown.
     * Use apenas em casos críticos onde não é seguro continuar.
     */
    exit(code: ExitCode): never {
        if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
            throw new ProcessExitError(code);
        }
        process.exit(code);
    }

    private setupSignalHandlers(): void {
        process.on('SIGINT', () => this.shutdown(EXIT_SIGINT));
        process.on('SIGTERM', () => this.shutdown(0));
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.shutdown(1);
        });

        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            this.shutdown(1);
        });
    }
}

/**
 * Erro especial para identificar chamadas a process.exit() em testes.
 */
export class ProcessExitError extends Error {
    constructor(public readonly code: ExitCode) {
        super(`Process exited with code ${code}`);
        this.name = 'ProcessExitError';
    }
}
