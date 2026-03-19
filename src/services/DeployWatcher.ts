/**
 * DeployWatcher - Específico para watch de deploy
 * Usa FileWatcher genérico e adiciona lógica de deploy
 */

import { FileWatcher, type FileChangeEvent } from "./FileWatcher";
import { DeployCommand } from "../commands/DeployCommand";
import { Logger } from "../utils/ui";
import type { AppConfig } from "../types/config";
import { WATCHER_DEBOUNCE_MS, WATCHER_COOLING_MS } from "../utils/constants";

export class DeployWatcher {
    private fileWatcher: FileWatcher;
    private isDeploying = false;
    private pendingFullBuild = false;
    private modifiedFiles = new Set<string>();
    private pendingFiles = new Set<string>();
    private hasPendingChanges = false;

    constructor(
        private config: AppConfig,
        private deployCmd: DeployCommand
    ) {
        this.fileWatcher = new FileWatcher({
            recursive: true,
            debounceMs: WATCHER_DEBOUNCE_MS,
            coolingMs: WATCHER_COOLING_MS,
        });
    }

    /**
     * Inicia o watch de deploy
     */
    async start(): Promise<void> {
        // Executa deploy inicial
        await this.run(false);

        // Configura handlers
        this.setupHandlers();

        // Inicia o watcher
        this.fileWatcher.start();

        Logger.info("DeployWatcher", "Monitorando alterações...");
    }

    /**
     * Para o watching
     */
    stop(): void {
        this.fileWatcher.stop();
    }

    /**
     * Configura handlers para diferentes tipos de arquivos
     */
    private setupHandlers(): void {
        // Handler para configurações de build
        this.fileWatcher.on(/(pom\.xml|build\.gradle|build\.gradle\.kts)$/, (event) => {
            this.handleBuildConfigChange(event);
        });

        // Handler para arquivos Java
        this.fileWatcher.on(/\.java$/, (event) => {
            this.handleJavaChange(event);
        });

        // Handler para recursos estáticos (JSP, HTML, CSS, etc)
        this.fileWatcher.on(/\.(jsp|html|css|js|xml|properties)$/, (event) => {
            this.handleResourceChange(event);
        });
    }

    /**
     * Trata mudança em arquivo de configuração de build
     */
    private async handleBuildConfigChange(event: FileChangeEvent): Promise<void> {
        if (!event.filename) return;

        Logger.watcher(`Build configuration changed: ${event.filename}`, 'warn');
        
        // Limpa cache quando config muda
        const { BuildCacheService } = await import("./BuildCacheService");
        new BuildCacheService().clearCache();
        
        this.pendingFullBuild = true;
    }

    /**
     * Trata mudança em arquivo Java
     */
    private handleJavaChange(event: FileChangeEvent): void {
        if (!event.filename || this.isDeploying) {
            if (event.filename) {
                this.pendingFiles.add(event.filename);
                this.hasPendingChanges = true;
            }
            return;
        }

        Logger.watcher(event.filename, 'watch');
        this.modifiedFiles.add(event.filename);

        // Debounce para acumular múltiplas mudanças
        this.scheduleDeploy();
    }

    /**
     * Trata mudança em recurso estático
     */
    private async handleResourceChange(event: FileChangeEvent): Promise<void> {
        if (!event.filename) return;

        Logger.watcher(event.filename, 'resource');
        
        try {
            await this.deployCmd.syncResource(this.config, event.filename);
        } catch (error) {
            Logger.error(`Falha ao sincronizar recurso: ${event.filename}`);
        }
    }

    /**
     * Agenda deploy após debounce
     */
    private scheduleDeploy(): void {
        // O debounce já é feito pelo FileWatcher
        // Aqui apenas executamos o deploy
        const filesToCompile = [...this.modifiedFiles];
        this.modifiedFiles.clear();
        
        this.run(this.pendingFullBuild ? false : true, filesToCompile);
        this.pendingFullBuild = false;
    }

    /**
     * Executa o deploy
     */
    private async run(incremental = false, changedFiles?: string[]): Promise<void> {
        if (this.isDeploying) return;
        
        this.isDeploying = true;
        
        try {
            await this.deployCmd.execute(this.config, {
                watch: true,
                incremental,
                changedFiles,
            });
        } catch (error) {
            // Erro já é tratado pelo comando
        } finally {
            this.isDeploying = false;
            
            // Processa mudanças pendentes
            if (this.hasPendingChanges) {
                const pending = [...this.pendingFiles];
                this.pendingFiles.clear();
                this.hasPendingChanges = false;
                
                Logger.watcher(`Processing ${pending.length} pending change(s)...`, 'warn');
                
                setTimeout(() => {
                    this.run(true, pending);
                }, 100);
            }
        }
    }

    /**
     * Verifica se é arquivo de recurso (não Java)
     */
    static isResourceFile(filename: string): boolean {
        return /\.(jsp|html|css|js|xml|properties)$/.test(filename);
    }

    /**
     * Verifica se é arquivo de configuração de build
     */
    static isBuildConfig(filename: string): boolean {
        return /^(pom\.xml|build\.gradle|build\.gradle\.kts)$/.test(filename);
    }
}
