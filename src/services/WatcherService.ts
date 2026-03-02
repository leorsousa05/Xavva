import { watch } from "fs";
import { Logger } from "../utils/ui";
import { DeployCommand } from "../commands/DeployCommand";
import type { AppConfig } from "../types/config";

export class WatcherService {
    private isDeploying = false;
    private pendingFullBuild = false;
    private coolingFiles = new Set<string>();
    private debounceTimer?: Timer;

    constructor(private config: AppConfig, private deployCmd: DeployCommand) {}

    public async start() {
        await this.run(false);

        watch(process.cwd(), { recursive: true }, async (event, filename) => {
            if (!filename) return;

            if (this.coolingFiles.has(filename)) return;
            this.coolingFiles.add(filename);
            setTimeout(() => this.coolingFiles.delete(filename), 500);

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
            clearTimeout(this.debounceTimer);
            
            this.debounceTimer = setTimeout(() => {
                this.run(this.pendingFullBuild ? false : true);
                this.pendingFullBuild = false;
            }, 1000);
        });
    }

    private async run(incremental = false) {
        if (this.isDeploying) return;
        this.isDeploying = true;
        try {
            await this.deployCmd.execute(this.config, { watch: true, incremental });
        } catch (e) {
            // Error handled by command
        } finally {
            this.isDeploying = false;
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
