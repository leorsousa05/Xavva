import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { TomcatService } from "../services/TomcatService";
import { Logger } from "../logging";
import { ProcessManager } from "../utils/processManager";

export class StartCommand implements Command {
    private logger = Logger.getInstance();

    constructor(private tomcat: TomcatService) {}

    async execute(config: AppConfig): Promise<void> {
        const tomcat = this.tomcat;
        
        this.logger.section("Start Only");
        this.logger.config("Port", config.tomcat.port);
        if (config.project.debug) this.logger.config("Debugger", "Active (5005)");
        
        try {
            this.logger.step("Checking ports");
            await tomcat.killConflict();
            this.logger.step("Starting Tomcat");
            tomcat.start(config, false);
            
            await new Promise(() => {}); 
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(message);
            await ProcessManager.getInstance().shutdown(1);
        }
    }
}
