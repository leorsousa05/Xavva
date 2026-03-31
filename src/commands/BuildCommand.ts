import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { BuildService } from "../services/BuildService";
import { Logger } from "../logging";
import { ProcessManager } from "../utils/processManager";

export class BuildCommand implements Command {
    private logger = Logger.getInstance();

    constructor(private buildService: BuildService) {}

    async execute(config: AppConfig): Promise<void> {
        this.logger.section("Build Only");
        this.logger.config("Tool", config.project.buildTool.toUpperCase());
        if (config.project.profile) this.logger.config("Profile", config.project.profile);
        
        try {
            await this.buildService.runBuild();
            this.logger.success("Build completed successfully!");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(message);
            await ProcessManager.getInstance().shutdown(1);
        }
    }
}
