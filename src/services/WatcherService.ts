import { watch } from "fs";
import { Logger } from "../utils/ui";
import { DeployCommand } from "../commands/DeployCommand";
import { WATCHER_DEBOUNCE_MS, WATCHER_COOLING_MS } from "../utils/constants";
import type { AppConfig } from "../types/config";

export class WatcherService {
    private isDeploying = false;
    private pendingFullBuild = false;
    private coolingFiles = new Set<string>();
    private debounceTimer?: Timer;
    
    // Rastreamento de arquivos modificados para build incremental inteligente
    private modifiedFiles = new Set<string>();
    private pendingFiles = new Set<string>(); // Arquivos modificados durante compilação
    private hasPendingChanges = false;

    constructor(private config: AppConfig, private deployCmd: DeployCommand) {}

    public async start() {
        await this.run(false);

        watch(process.cwd(), { recursive: true }, async (event, filename) => {
            if (!filename) return;

            if (this.coolingFiles.has(filename)) return;
            this.coolingFiles.add(filename);
            setTimeout(() => this.coolingFiles.delete(filename), WATCHER_COOLING_MS);

            if (this.isIgnored(filename)) return;

            const isBuildConfig = filename === "pom.xml" || filename === "build.gradle" || filename === "build.gradle.kts";
            const isJava = filename.endsWith(".java") || isBuildConfig;
            const isResource = this.isResourceFile(filename);

            if (isBuildConfig) {
                Logger.watcher(`Build configuration changed: ${filename}`, 'warn');
                const { BuildCacheService } = await import("./BuildCacheService");
                new BuildCacheService().clearCache();
                this.pendingFullBuild = true;
            }

            if (isResource && !isJava) {
                await this.deployCmd.syncResource(this.config, filename);
                return;
            }

            if (!isJava) return;

            Logger.watcher(filename, 'watch');
            
            // Se estiver compilando, acumula na fila de pendentes
            if (this.isDeploying) {
                this.pendingFiles.add(filename);
                this.hasPendingChanges = true;
                return;
            }
            
            // Acumula arquivos modificados para o próximo build
            this.modifiedFiles.add(filename);
            
            clearTimeout(this.debounceTimer);
            
            this.debounceTimer = setTimeout(() => {
                const filesToCompile = [...this.modifiedFiles];
                this.modifiedFiles.clear();
                this.run(this.pendingFullBuild ? false : true, filesToCompile);
                this.pendingFullBuild = false;
            }, WATCHER_DEBOUNCE_MS);
        });
    }

    private async run(incremental = false, changedFiles?: string[]) {
        if (this.isDeploying) return;
        this.isDeploying = true;
        
        try {
            // Passa os arquivos específicos que foram modificados
            await this.deployCmd.execute(this.config, { 
                watch: true, 
                incremental,
                changedFiles 
            });
        } catch (e) {
            // Error handled by command
        } finally {
            this.isDeploying = false;
            
            // Se houve mudanças durante a compilação, processa imediatamente
            if (this.hasPendingChanges) {
                const pending = [...this.pendingFiles];
                this.pendingFiles.clear();
                this.hasPendingChanges = false;
                
                Logger.watcher(`Processing ${pending.length} pending change(s)...`, 'warn');
                
                // Pequeno delay para garantir que os arquivos foram salvos completamente
                setTimeout(() => {
                    this.run(true, pending);
                }, 100);
            }
        }
    }

    private isIgnored(filename: string): boolean {
        return filename.includes("target") || 
               filename.includes("build") || 
               filename.includes("node_modules") || 
               filename.split(/[/\\]/).some(part => part.startsWith("."));
    }

    private isResourceFile(filename: string): boolean {
        return filename.endsWith(".jsp") || filename.endsWith(".html") || 
               filename.endsWith(".css") || filename.endsWith(".js") || 
               filename.endsWith(".xml") || filename.endsWith(".properties");
    }
}
