import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { ProjectService } from "../services/ProjectService";
import { Logger } from "../utils/ui";

export class ProfilesCommand implements Command {
    constructor(private projectService: ProjectService) {}

    async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
        Logger.section("Project Profiles");
        
        Logger.info("Build Tool", config.project.buildTool.toUpperCase());
        
        const profiles = this.projectService.getAvailableProfiles();

        if (profiles.length === 0) {
            Logger.warn("Nenhum perfil específico encontrado no arquivo de configuração.");
            Logger.log(`  ${Logger.C.dim}Dica: Perfis Maven são definidos em <profiles> no pom.xml.${Logger.C.reset}`);
            return;
        }

        Logger.log(`
  ${Logger.C.primary}Perfis detectados:${Logger.C.reset}`);
        profiles.forEach(p => {
            const active = config.project.profile === p ? ` ${Logger.C.green}(Ativo)${Logger.C.reset}` : "";
            Logger.log(`  ${Logger.C.bold}➜${Logger.C.reset} ${p}${active}`);
        });

        Logger.newline();
        Logger.log(`  ${Logger.C.dim}Para usar um perfil: xavva build -P nome-do-perfil${Logger.C.reset}`);
    }
}
