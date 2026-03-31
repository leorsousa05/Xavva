/**
 * DeployWatcher - Específico para watch de deploy
 * 
 * Melhorias:
 * - Debounce inteligente com batch processing
 * - Priorização de tipos de arquivos
 * - Rate limiting de builds
 * - Métricas de performance
 */

import { FileWatcher, type FileChangeEvent } from "./FileWatcher";
import { DeployCommand } from "../commands/DeployCommand";
import { Logger } from "../logging";
import type { AppConfig } from "../types/config";
import { TIMEOUTS } from "../config/versions";

interface WatcherMetrics {
    filesChanged: number;
    buildsTriggered: number;
    lastBuildTime: number;
    avgBuildTime: number;
    buildTimes: number[];
}

export class DeployWatcher {
    private fileWatcher: FileWatcher;
    private isDeploying = false;
    private pendingFullBuild = false;
    private modifiedFiles = new Set<string>();
    private pendingFiles = new Set<string>();
    private hasPendingChanges = false;
    private logger = Logger.getInstance();
    
    // Debounce e batching
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly DEBOUNCE_MS = TIMEOUTS.DEBOUNCE;
    private readonly MAX_BATCH_SIZE = 50;
    private readonly MIN_BUILD_INTERVAL_MS = 500;
    
    // Métricas
    private metrics: WatcherMetrics = {
        filesChanged: 0,
        buildsTriggered: 0,
        lastBuildTime: 0,
        avgBuildTime: 0,
        buildTimes: [],
    };
    
    // Priorização de arquivos
    private static readonly PRIORITY = {
        BUILD_CONFIG: 1,  // pom.xml, build.gradle
        JAVA: 2,          // .java
        RESOURCE: 3,      // .jsp, .html, etc
    };

    constructor(
        private config: AppConfig,
        private deployCmd: DeployCommand
    ) {
        this.fileWatcher = new FileWatcher({
            recursive: true,
            debounceMs: TIMEOUTS.WATCHER_DEBOUNCE,
            coolingMs: TIMEOUTS.COOLING,
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

        this.logger.status("watch", "running", "monitorando arquivos");
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

        this.logger.file(event.filename, 'changed');
        this.logger.info("Configuração de build alterada - rebuild completo necessário");
        
        // Limpa cache quando config muda
        const { BuildCacheService } = await import("./BuildCacheService");
        new BuildCacheService().clearCache();
        
        this.pendingFullBuild = true;
    }

    /**
     * Trata mudança em arquivo Java com debounce inteligente
     */
    private handleJavaChange(event: FileChangeEvent): void {
        if (!event.filename) return;

        this.metrics.filesChanged++;
        this.logger.file(event.filename, 'changed');
        this.modifiedFiles.add(event.filename);

        // Se muitos arquivos mudaram, faz full build
        if (this.modifiedFiles.size >= this.MAX_BATCH_SIZE) {
            this.logger.warn(`Muitos arquivos modificados (${this.modifiedFiles.size}) - forçando build completo`);
            this.pendingFullBuild = true;
            this.flush();
            return;
        }

        // Debounce normal
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.flush();
        }, this.DEBOUNCE_MS);
    }

    /**
     * Processa batch de arquivos modificados
     */
    private flush(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        const files = [...this.modifiedFiles];
        this.modifiedFiles.clear();

        if (files.length === 0) return;

        // Rate limiting
        const timeSinceLastBuild = Date.now() - this.metrics.lastBuildTime;
        if (timeSinceLastBuild < this.MIN_BUILD_INTERVAL_MS) {
            const delay = this.MIN_BUILD_INTERVAL_MS - timeSinceLastBuild;
            setTimeout(() => this.run(this.pendingFullBuild ? false : true, files), delay);
        } else {
            this.run(this.pendingFullBuild ? false : true, files);
        }

        this.pendingFullBuild = false;
    }

    /**
     * Trata mudança em recurso estático
     */
    private async handleResourceChange(event: FileChangeEvent): Promise<void> {
        if (!event.filename) return;

        this.logger.file(event.filename, 'changed');
        
        try {
            await this.deployCmd.syncResource(this.config, event.filename);
        } catch (error) {
            this.logger.error(`Falha ao sincronizar: ${event.filename}`);
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
     * Executa o deploy com métricas
     */
    private async run(incremental = false, changedFiles?: string[]): Promise<void> {
        if (this.isDeploying) {
            // Acumula para próximo ciclo
            if (changedFiles) {
                changedFiles.forEach(f => this.pendingFiles.add(f));
                this.hasPendingChanges = true;
            }
            return;
        }
        
        this.isDeploying = true;
        const buildStart = performance.now();
        this.metrics.buildsTriggered++;
        
        try {
            await this.deployCmd.execute(this.config, {
                watch: true,
                incremental,
                changedFiles,
            });
            
            // Atualiza métricas
            const buildTime = performance.now() - buildStart;
            this.metrics.lastBuildTime = Date.now();
            this.metrics.buildTimes.push(buildTime);
            
            // Mantém apenas últimos 10 builds para média
            if (this.metrics.buildTimes.length > 10) {
                this.metrics.buildTimes.shift();
            }
            
            this.metrics.avgBuildTime = 
                this.metrics.buildTimes.reduce((a, b) => a + b, 0) / this.metrics.buildTimes.length;
            
            this.logger.debug(`Build em ${buildTime.toFixed(0)}ms (média: ${this.metrics.avgBuildTime.toFixed(0)}ms)`);
            
        } catch (error) {
            // Erro já é tratado pelo comando
        } finally {
            this.isDeploying = false;
            
            // Processa mudanças pendentes
            if (this.hasPendingChanges || this.pendingFiles.size > 0) {
                const pending = [...this.pendingFiles];
                this.pendingFiles.clear();
                this.hasPendingChanges = false;
                
                this.logger.info(`${pending.length} arquivo(s) pendente(s)`);
                
                setTimeout(() => {
                    this.run(true, pending);
                }, 100);
            }
        }
    }

    /**
     * Obtém métricas do watcher
     */
    getMetrics(): WatcherMetrics {
        return { ...this.metrics };
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
