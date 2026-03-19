/**
 * FileWatcher genérico
 * Responsabilidade única: observar mudanças em arquivos
 * Sem acoplamento com lógica de deploy
 */

import { watch, type FSWatcher } from "fs";
import { Logger } from "../utils/ui";

export interface FileWatcherOptions {
    recursive?: boolean;
    debounceMs?: number;
    coolingMs?: number;
    ignoredPatterns?: RegExp[];
}

export interface FileChangeEvent {
    eventType: "rename" | "change";
    filename: string | null;
    fullPath: string;
}

export type FileChangeHandler = (event: FileChangeEvent) => void | Promise<void>;

export class FileWatcher {
    private watcher: FSWatcher | null = null;
    private options: Required<FileWatcherOptions>;
    private handlers: Map<string, FileChangeHandler> = new Map();
    private debounceTimers: Map<string, Timer> = new Map();
    private coolingFiles: Set<string> = new Set();
    private isWatching = false;

    private static readonly DEFAULT_OPTIONS: Required<FileWatcherOptions> = {
        recursive: true,
        debounceMs: 300,
        coolingMs: 1000,
        ignoredPatterns: [
            /node_modules/,
            /\.git/,
            /target/,
            /build/,
            /\.xavva/,
            /\.idea/,
            /\.vscode/,
            /dist/,
            /out/,
        ],
    };

    constructor(options: FileWatcherOptions = {}) {
        this.options = { ...FileWatcher.DEFAULT_OPTIONS, ...options };
    }

    /**
     * Registra um handler para um padrão específico
     */
    on(pattern: string | RegExp, handler: FileChangeHandler): () => void {
        const key = pattern.toString();
        this.handlers.set(key, handler);
        
        // Retorna função para remover handler
        return () => this.handlers.delete(key);
    }

    /**
     * Registra handler para qualquer mudança
     */
    onAny(handler: FileChangeHandler): () => void {
        return this.on("*", handler);
    }

    /**
     * Inicia o watching
     */
    start(rootPath: string = process.cwd()): void {
        if (this.isWatching) {
            Logger.debug("FileWatcher já está rodando");
            return;
        }

        this.watcher = watch(
            rootPath,
            { recursive: this.options.recursive },
            (eventType, filename) => this.handleWatchEvent(eventType, filename)
        );

        this.isWatching = true;
        Logger.debug(`FileWatcher iniciado em ${rootPath}`);
    }

    /**
     * Para o watching
     */
    stop(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        
        // Limpa timers pendentes
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();
        
        this.isWatching = false;
        Logger.debug("FileWatcher parado");
    }

    /**
     * Verifica se está observando
     */
    isActive(): boolean {
        return this.isWatching;
    }

    /**
     * Processa evento do fs.watch
     */
    private handleWatchEvent(
        eventType: "rename" | "change",
        filename: string | null
    ): void {
        if (!filename) return;

        // Ignora arquivos em cooling
        if (this.coolingFiles.has(filename)) return;
        this.addToCooling(filename);

        // Ignora patterns definidos
        if (this.isIgnored(filename)) return;

        const fullPath = this.resolvePath(filename);
        const event: FileChangeEvent = { eventType, filename, fullPath };

        // Aplica debounce
        this.debounce(filename, () => {
            this.notifyHandlers(event);
        });
    }

    /**
     * Adiciona arquivo ao período de cooling
     */
    private addToCooling(filename: string): void {
        this.coolingFiles.add(filename);
        setTimeout(() => {
            this.coolingFiles.delete(filename);
        }, this.options.coolingMs);
    }

    /**
     * Verifica se arquivo deve ser ignorado
     */
    private isIgnored(filename: string): boolean {
        return this.options.ignoredPatterns.some(pattern => pattern.test(filename));
    }

    /**
     * Resolve caminho completo
     */
    private resolvePath(filename: string): string {
        // Normaliza separadores de path
        return filename.replace(/\\/g, "/");
    }

    /**
     * Aplica debounce no handler
     */
    private debounce(key: string, fn: () => void): void {
        const existing = this.debounceTimers.get(key);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            this.debounceTimers.delete(key);
            fn();
        }, this.options.debounceMs);

        this.debounceTimers.set(key, timer);
    }

    /**
     * Notifica todos os handlers relevantes
     */
    private notifyHandlers(event: FileChangeEvent): void {
        // Notifica handlers específicos
        for (const [pattern, handler] of this.handlers) {
            if (this.matchesPattern(event.filename, pattern)) {
                try {
                    const result = handler(event);
                    if (result instanceof Promise) {
                        result.catch(err => {
                            Logger.debug(`Erro em handler de watch: ${err.message}`);
                        });
                    }
                } catch (err) {
                    Logger.debug(`Erro em handler de watch: ${(err as Error).message}`);
                }
            }
        }
    }

    /**
     * Verifica se filename match com pattern
     */
    private matchesPattern(filename: string | null, pattern: string): boolean {
        if (!filename) return false;
        if (pattern === "*") return true;
        
        try {
            const regex = new RegExp(pattern);
            return regex.test(filename);
        } catch {
            // Se não for regex válido, trata como string simples
            return filename.includes(pattern);
        }
    }
}

/**
 * Helper para criar watcher com configuração padrão de projetos Java
 */
export function createJavaFileWatcher(): FileWatcher {
    return new FileWatcher({
        recursive: true,
        debounceMs: 300,
        coolingMs: 1000,
        ignoredPatterns: [
            /node_modules/,
            /\.git/,
            /target/,
            /build/,
            /\.xavva/,
            /\.idea/,
            /\.vscode/,
            /dist/,
            /out/,
            /\.class$/,
            /\.jar$/,
            /\.war$/,
        ],
    });
}
