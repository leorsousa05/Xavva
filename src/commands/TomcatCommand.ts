import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { EmbeddedTomcatService } from "../services/EmbeddedTomcatService";
import { Logger } from "../utils/ui";
import path from "path";
import fs from "fs";

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
            case "installed":
                this.handleInstalled();
                break;
            case "use":
                await this.handleUse(config, args, extraArgs);
                break;
            case "uninstall":
                await this.handleUninstall(config, args, extraArgs);
                break;
            case "status":
                await this.handleStatus(config);
                break;
            default:
                Logger.error(`Ação desconhecida: ${action}`);
                Logger.info("Ações disponíveis", "install, list, installed, use, uninstall, status");
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
        Logger.section("Versões Disponíveis para Download");
        const versions = EmbeddedTomcatService.getAvailableVersions();
        
        for (const version of versions) {
            Logger.log(`  ${Logger.C.primary}•${Logger.C.reset} ${version}`);
        }
        
        Logger.newline();
        Logger.info("Versão padrão", "10.1.52");
        Logger.newline();
        Logger.info("Dica", "Use 'xavva tomcat installed' para ver versões já instaladas");
    }

    private handleInstalled(): void {
        const installed = EmbeddedTomcatService.listInstalledVersions();
        
        Logger.section("Versões Instaladas");
        
        if (installed.length === 0) {
            Logger.warn("Nenhuma versão instalada");
            Logger.info("Dica", "Use 'xavva tomcat install <version>' para instalar");
            return;
        }
        
        for (const version of installed) {
            Logger.log(`  ${Logger.C.success}✓${Logger.C.reset} ${version}`);
        }
        
        Logger.newline();
        Logger.info("Para usar uma versão", "xavva tomcat use <version>");
    }

    private async handleUse(config: AppConfig, args?: CLIArguments, extraArgs: string[] = []): Promise<void> {
        const version = extraArgs[0] || args?.["tomcat-version"];
        
        if (!version) {
            Logger.error("Versão não especificada");
            Logger.info("Uso", "xavva tomcat use <version>");
            Logger.info("Exemplo", "xavva tomcat use 9.0.115");
            Logger.newline();
            Logger.info("Versões instaladas", "");
            this.handleInstalled();
            return;
        }
        
        // Verifica se a versão está instalada
        const service = new EmbeddedTomcatService({
            version,
            port: config.tomcat.port,
            webappPath: "."
        });
        
        if (!service.checkInstallation()) {
            Logger.warn(`Tomcat ${version} não está instalado`);
            Logger.newline();
            Logger.info("Opções", "");
            Logger.log(`  ${Logger.C.primary}1.${Logger.C.reset} Instalar agora: xavva tomcat install ${version}`);
            Logger.log(`  ${Logger.C.primary}2.${Logger.C.reset} Ver instaladas: xavva tomcat installed`);
            return;
        }
        
        // Salva a versão no xavva.json do projeto
        await this.saveTomcatVersion(version);
        
        Logger.success(`Tomcat ${version} configurado para este projeto!`);
        Logger.newline();
        Logger.info("Próximos comandos", "");
        Logger.log(`  ${Logger.C.primary}•${Logger.C.reset} xavva dev    # Iniciar desenvolvimento`);
        Logger.log(`  ${Logger.C.primary}•${Logger.C.reset} xavva deploy # Fazer deploy`);
    }

    private async saveTomcatVersion(version: string): Promise<void> {
        const xavvaJsonPath = path.join(process.cwd(), "xavva.json");
        let config: any = {};
        
        if (fs.existsSync(xavvaJsonPath)) {
            try {
                config = JSON.parse(fs.readFileSync(xavvaJsonPath, "utf-8"));
            } catch (e) {
                // Arquivo existe mas é inválido, começa do zero
            }
        }
        
        if (!config.tomcat) config.tomcat = {};
        config.tomcat.version = version;
        config.tomcat.embedded = true;
        
        fs.writeFileSync(xavvaJsonPath, JSON.stringify(config, null, 2));
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
