import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { EmbeddedTomcatService } from "../services/EmbeddedTomcatService";
import { Logger } from "../utils/ui";
import path from "path";

export class TomcatCommand implements Command {
    async execute(config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        // A ação vem como positional após "tomcat" (ex: xavva tomcat list)
        const tomcatIndex = positionals?.indexOf("tomcat") ?? -1;
        const action = positionals && tomcatIndex >= 0 && positionals[tomcatIndex + 1] 
            ? positionals[tomcatIndex + 1] 
            : "status";
        
        // Argumentos extras após a ação (ex: xavva tomcat install 9.0.115)
        const extraArgs = positionals && tomcatIndex >= 0 ? positionals.slice(tomcatIndex + 2) : [];
        
        switch (action) {
            case "install":
                await this.handleInstall(config, args, extraArgs);
                break;
            case "list":
                this.handleList();
                break;
            case "uninstall":
                await this.handleUninstall(config, args, extraArgs);
                break;
            case "status":
                await this.handleStatus(config);
                break;
            default:
                Logger.error(`Ação desconhecida: ${action}`);
                Logger.info("Ações disponíveis", "install, list, uninstall, status");
        }
    }

    private async handleInstall(config: AppConfig, args?: CLIArguments, extraArgs: string[] = []): Promise<void> {
        // Versão pode vir de: flag --tomcat-version, argumento posicional, config, ou padrão
        const version = args?.["tomcat-version"] || extraArgs[0] || config.tomcat.version || "10.1.52";
        
        // Detectar webapp path
        const webappPath = config.project.buildTool === "maven"
            ? path.join(process.cwd(), "src", "main", "webapp")
            : path.join(process.cwd(), "src", "main", "webapp");

        const service = new EmbeddedTomcatService({
            version,
            port: config.tomcat.port,
            webappPath
        });

        if (service.checkInstallation()) {
            Logger.info("Tomcat", `Versão ${version} já está instalada`);
            const info = service.getInfo();
            Logger.config("Local", info.home);
            return;
        }

        const installed = await service.install();
        if (installed) {
            Logger.success(`Tomcat ${version} instalado com sucesso!`);
        } else {
            Logger.error("Falha na instalação");
        }
    }

    private handleList(): void {
        Logger.section("Versões Disponíveis");
        const versions = EmbeddedTomcatService.getAvailableVersions();
        
        for (const version of versions) {
            Logger.log(`  ${Logger.C.primary}•${Logger.C.reset} ${version}`);
        }
        
        Logger.newline();
        Logger.info("Versão padrão", "10.1.52");
    }

    private async handleUninstall(config: AppConfig, args?: CLIArguments, extraArgs: string[] = []): Promise<void> {
        // Versão pode vir de: flag --tomcat-version, argumento posicional, config, ou padrão
        const version = args?.["tomcat-version"] || extraArgs[0] || config.tomcat.version || "10.1.52";
        
        const service = new EmbeddedTomcatService({
            version,
            port: config.tomcat.port,
            webappPath: "."
        });

        if (!service.checkInstallation()) {
            Logger.warn(`Tomcat ${version} não está instalado`);
            return;
        }

        Logger.step(`Removendo Tomcat ${version}...`);
        await service.uninstall();
        Logger.success("Removido com sucesso!");
    }

    private async handleStatus(config: AppConfig): Promise<void> {
        Logger.section("Status do Tomcat");
        
        if (config.tomcat.embedded) {
            Logger.config("Modo", "Embutido");
            Logger.config("Versão", config.tomcat.version || "10.1.52");
            Logger.config("Porta", String(config.tomcat.port));
            Logger.config("Home", config.tomcat.path);
        } else {
            Logger.config("Modo", "Externo");
            Logger.config("CATALINA_HOME", config.tomcat.path);
            Logger.config("Porta", String(config.tomcat.port));
        }
        
        // Verificar se está rodando
        const netstat = Bun.spawnSync(["cmd", "/c", `netstat -ano | findstr :${config.tomcat.port}`]);
        const output = await new Response(netstat.stdout).text();
        
        if (output.trim()) {
            Logger.config("Status", `${Logger.C.success}Rodando${Logger.C.reset}`);
        } else {
            Logger.config("Status", `${Logger.C.warning}Parado${Logger.C.reset}`);
        }
    }
}
