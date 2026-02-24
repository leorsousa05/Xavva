import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { TomcatService } from "../services/TomcatService";
import { Logger } from "../utils/ui";

export class StartCommand implements Command {
    async execute(config: AppConfig): Promise<void> {
        const tomcat = new TomcatService(config.tomcat);
        
        Logger.section("Start Only");
        Logger.info("Port", config.tomcat.port);
        if (config.project.debug) Logger.info("Debugger", "Active (5005)");
        
        try {
            Logger.step("Checking ports");
            await tomcat.killConflict();
            Logger.step("Starting Tomcat");
            tomcat.start(config, false);
            
            await new Promise(() => {}); 
        } catch (error: any) {
            Logger.error(error.message);
            process.exit(1);
        }
    }
}
