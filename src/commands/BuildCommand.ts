import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { BuildService } from "../services/BuildService";
import { Logger } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";

export class BuildCommand implements Command {
    constructor(private buildService: BuildService) {}

    async execute(config: AppConfig): Promise<void> {
        Logger.section("Build Only");
        Logger.info("Tool", config.project.buildTool.toUpperCase());
        if (config.project.profile) Logger.info("Profile", config.project.profile);
        
        try {
            await this.buildService.runBuild();
            Logger.success("Build completed successfully!");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            Logger.error(message);
            await ProcessManager.getInstance().shutdown(1);
        }
    }
}