import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { BuildService } from "../services/BuildService";
import { Logger } from "../utils/ui";

export class BuildCommand implements Command {
    async execute(config: AppConfig): Promise<void> {
        const builder = new BuildService(config.project, config.tomcat);
        
        Logger.section("Build Only");
        Logger.info("Tool", config.project.buildTool.toUpperCase());
        if (config.project.profile) Logger.info("Profile", config.project.profile);
        
        try {
            await builder.runBuild();
            Logger.success("Build completed successfully!");
        } catch (error: any) {
            Logger.error(error.message);
            process.exit(1);
        }
    }
}