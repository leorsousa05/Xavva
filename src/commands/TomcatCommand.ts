import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger, C } from "../utils/ui";
// TomcatManagerService será implementado em fase futura
import { TomcatInstallerService } from "../services/tomcat";
import path from "path";
import fs from "fs";

export class TomcatCommand implements Command {
    private installer = new TomcatInstallerService();

    private showHelp(): void {
        Logger.section("Tomcat Command");
        Logger.log(`${C.bold}Usage:${C.reset} xavva tomcat <action> [options]`);
        Logger.newline();
        Logger.log(`${C.bold}Actions:${C.reset}`);
        Logger.log(`  ${C.primary}list${C.reset}         List available Tomcat versions`);
        Logger.log(`  ${C.primary}installed${C.reset}    List installed versions`);
        Logger.log(`  ${C.primary}install${C.reset}      Install a version`);
        Logger.log(`  ${C.primary}use${C.reset}          Set version for this project`);
        Logger.log(`  ${C.primary}uninstall${C.reset}    Remove a version`);
        Logger.log(`  ${C.primary}status${C.reset}       Show current configuration`);
        Logger.log(`  ${C.primary}backup${C.reset}       Manage backups`);
        Logger.log(`  ${C.primary}cache${C.reset}        Manage download cache`);
        Logger.log(`  ${C.primary}mirrors${C.reset}      Test and select mirrors`);
        Logger.newline();
        Logger.log(`${C.bold}Install Options:${C.reset}`);
        Logger.log(`  ${C.primary}--mirror${C.reset} <name>      Use specific mirror (or 'auto')`);
        Logger.log(`  ${C.primary}--no-checksum${C.reset}      Skip checksum verification`);
        Logger.log(`  ${C.primary}--no-cache${C.reset}         Don't use download cache`);
        Logger.log(`  ${C.primary}--no-backup${C.reset}        Skip backup if exists`);
        Logger.log(`  ${C.primary}--silent${C.reset}           Silent mode (CI/CD)`);
        Logger.log(`  ${C.primary}--timeout${C.reset} <sec>    Download timeout (default: 300)`);
        Logger.log(`  ${C.primary}--retries${C.reset} <n>      Retry attempts (default: 3)`);
        Logger.log(`  ${C.primary}--force${C.reset}            Force reinstallation`);
        Logger.log(`  ${C.primary}--parallel${C.reset}         Install multiple versions`);
        Logger.newline();
        Logger.log(`${C.bold}Examples:${C.reset}`);
        Logger.log(`  xavva tomcat list`);
        Logger.log(`  xavva tomcat install 10.1.52`);
        Logger.log(`  xavva tomcat install 9.0.115 --mirror auto`);
        Logger.log(`  xavva tomcat install 10.1.52 9.0.115 --parallel`);
        Logger.log(`  xavva tomcat use 10.1.52`);
        Logger.log(`  xavva tomcat backup list`);
        Logger.log(`  xavva tomcat cache stats`);
        Logger.log(`  xavva tomcat mirrors test`);
    }

    async execute(config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        if (args?.help) {
            this.showHelp();
            return;
        }

        const tomcatIndex = positionals?.indexOf("tomcat") ?? -1;
        const action = positionals && tomcatIndex >= 0 && positionals[tomcatIndex + 1] 
            ? positionals[tomcatIndex + 1] 
            : "status";
        
        const extraArgs = positionals && tomcatIndex >= 0 ? positionals.slice(tomcatIndex + 2) : [];
        
        switch (action) {
            case "install":
                await this.handleInstall(config, args, extraArgs);
                break;
            case "list":
                await this.handleList();
                break;
            case "installed":
                await this.handleInstalled();
                break;
            case "use":
                await this.handleUse(config, args, extraArgs);
                break;
            case "uninstall":
                await this.handleUninstall(config, args, extraArgs);
                break;
            case "backup":
                await this.handleBackup(extraArgs);
                break;
            case "cache":
                await this.handleCache(extraArgs);
                break;
            case "mirrors":
                await this.handleMirrors(extraArgs);
                break;
            case "status":
                Logger.info("Status", "Tomcat manager avançado em desenvolvimento");
                break;
            default:
                Logger.error(`Ação desconhecida: ${action}`);
                Logger.info("Ações disponíveis", "install, list, installed, use, uninstall, backup, cache, mirrors, status");
        }
    }

    private async handleInstall(config: AppConfig, args?: CLIArguments, extraArgs: string[] = []): Promise<void> {
        // Verifica modo paralelo
        const isParallel = args?.parallel || extraArgs.includes("--parallel");
        
        // Coleta versões para instalar
        let versions: string[] = [];
        
        // Versão via flag
        if (args?.["tomcat-version"]) {
            versions.push(args["tomcat-version"]);
        }
        
        // Versões via args extras (remove flags)
        const versionArgs = extraArgs.filter(arg => !arg.startsWith("--"));
        versions.push(...versionArgs);
        
        // Se nenhuma versão especificada, usa padrão ou config
        if (versions.length === 0) {
            versions.push(config.tomcat.version || "10.1.52");
        }

        // Remove duplicatas
        versions = [...new Set(versions)];

        const installOptions = {
            version: versions[0], // Será sobrescrito no loop/paralelo
            mirror: args?.["tomcat-mirror"] as string | undefined,
            verifyChecksum: !args?.["no-checksum"] && !extraArgs.includes("--no-checksum"),
            useCache: !args?.["no-cache"] && !extraArgs.includes("--no-cache"),
            backup: !args?.["no-backup"] && !extraArgs.includes("--no-backup"),
            silent: args?.silent || extraArgs.includes("--silent"),
            timeout: parseInt(args?.timeout as string || "300"),
            retries: parseInt(args?.retries as string || "3"),
            force: args?.force || extraArgs.includes("--force"),
            projectPath: process.cwd()
        };

        if (isParallel && versions.length > 1) {
            await this.installer.installParallel(versions, installOptions);
        } else {
            for (const version of versions) {
                const result = await this.installer.install({
                    ...installOptions,
                    version
                });

                if (!result.success) {
                    Logger.error(`Falha ao instalar ${version}: ${result.error}`);
                }
            }
        }
    }

    private async handleList(): Promise<void> {
        Logger.section("Versões Disponíveis");
        
        const versions = ["11.0.6", "10.1.52", "10.0.27", "9.0.96", "8.5.100"];
        
        Logger.log(`${C.bold}Recomendadas:${C.reset}`);
        Logger.log(`  ${C.success}✓${C.reset} 10.1.52  - Jakarta EE 10, Servlet 6.0`);
        Logger.log(`  ${C.success}✓${C.reset} 9.0.96   - Java EE 8, Servlet 4.0 (mais estável)`);
        Logger.newline();
        
        Logger.log(`${C.bold}Outras versões:${C.reset}`);
        Logger.log(`  ${C.primary}•${C.reset} 11.0.6   - Jakarta EE 11, requer Java 21`);
        Logger.log(`  ${C.primary}•${C.reset} 10.0.27  - Jakarta EE 9 (legado)`);
        Logger.log(`  ${C.primary}•${C.reset} 8.5.100  - Java EE 7 (legado)`);
        Logger.newline();
        
        Logger.info("Dica", "Use 'xavva tomcat installed' para ver versões já instaladas");
    }

    private async handleInstalled(): Promise<void> {
        const installed = await this.installer.listInstalled();
        
        Logger.section("Versões Instaladas");
        
        if (installed.length === 0) {
            Logger.warn("Nenhuma versão instalada");
            Logger.info("Dica", "Use 'xavva tomcat install <version>' para instalar");
            return;
        }
        
        for (const version of installed) {
            const sizeMB = (version.size / 1024 / 1024).toFixed(1);
            Logger.log(`  ${C.success}✓${C.reset} ${C.bold}${version.version}${C.reset} (${sizeMB} MB)`);
            Logger.log(`    ${C.gray}Local:${C.reset} ${version.home}`);
        }
        
        Logger.newline();
        Logger.info("Para usar uma versão", "xavva tomcat use <version>");
    }

    private async handleUse(config: AppConfig, args?: CLIArguments, extraArgs: string[] = []): Promise<void> {
        const version = extraArgs[0] || args?.["tomcat-version"];
        
        if (!version) {
            Logger.error("Versão não especificada");
            Logger.info("Uso", "xavva tomcat use <version>");
            Logger.info("Exemplo", "xavva tomcat use 10.1.52");
            Logger.newline();
            await this.handleInstalled();
            return;
        }
        
        if (!this.installer.isInstalled(version)) {
            Logger.warn(`Tomcat ${version} não está instalado`);
            Logger.newline();
            Logger.info("Opções", "");
            Logger.log(`  ${C.primary}1.${C.reset} Instalar agora: xavva tomcat install ${version}`);
            Logger.log(`  ${C.primary}2.${C.reset} Ver instaladas: xavva tomcat installed`);
            return;
        }
        
        await this.saveTomcatVersion(version);
        
        Logger.success(`Tomcat ${version} configurado para este projeto!`);
        Logger.newline();
        Logger.info("Próximos comandos", "");
        Logger.log(`  ${C.primary}•${C.reset} xavva dev    # Iniciar desenvolvimento`);
        Logger.log(`  ${C.primary}•${C.reset} xavva deploy # Fazer deploy`);
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
        const version = args?.["tomcat-version"] || extraArgs[0] || config.tomcat.version;
        
        if (!version) {
            Logger.error("Versão não especificada");
            Logger.info("Uso", "xavva tomcat uninstall <version>");
            return;
        }

        if (!this.installer.isInstalled(version)) {
            Logger.warn(`Tomcat ${version} não está instalado`);
            return;
        }

        Logger.step(`Removendo Tomcat ${version}...`);
        await this.installer.uninstall(version);
    }

    private async handleBackup(extraArgs: string[] = []): Promise<void> {
        const subAction = extraArgs[0] || "list";

        switch (subAction) {
            case "list": {
                const version = extraArgs[1];
                const backups = await this.installer.listBackups(version);
                
                Logger.section("Backups Disponíveis");
                
                if (backups.length === 0) {
                    Logger.warn("Nenhum backup encontrado");
                    return;
                }

                for (const backup of backups) {
                    const sizeMB = (backup.size / 1024 / 1024).toFixed(1);
                    const date = backup.timestamp.toLocaleString();
                    Logger.log(`  ${C.primary}•${C.reset} ${backup.version} - ${date} (${sizeMB} MB)`);
                }
                break;
            }
            case "restore": {
                const version = extraArgs[1];
                if (!version) {
                    Logger.error("Versão não especificada");
                    Logger.info("Uso", "xavva tomcat backup restore <version>");
                    return;
                }
                
                const success = await this.installer.restoreBackup(version);
                if (success) {
                    Logger.success(`Backup de ${version} restaurado!`);
                } else {
                    Logger.error("Falha ao restaurar backup");
                }
                break;
            }
            default:
                Logger.error(`Ação de backup desconhecida: ${subAction}`);
                Logger.info("Ações", "list, restore");
        }
    }

    private async handleCache(extraArgs: string[] = []): Promise<void> {
        const subAction = extraArgs[0] || "stats";

        switch (subAction) {
            case "stats": {
                const stats = await this.installer.getCacheStats();
                const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
                
                Logger.section("Estatísticas do Cache");
                Logger.log(`  ${C.primary}•${C.reset} Arquivos: ${stats.files}`);
                Logger.log(`  ${C.primary}•${C.reset} Tamanho: ${sizeMB} MB`);
                break;
            }
            case "clear":
                await this.installer.clearCache();
                Logger.success("Cache limpo!");
                break;
            default:
                Logger.error(`Ação de cache desconhecida: ${subAction}`);
                Logger.info("Ações", "stats, clear");
        }
    }

    private async handleMirrors(extraArgs: string[] = []): Promise<void> {
        const { TomcatMirrorManager } = await import("../services/tomcat");
        const manager = new TomcatMirrorManager();

        const subAction = extraArgs[0] || "list";

        switch (subAction) {
            case "list": {
                const mirrors = manager.getMirrors();
                Logger.section("Mirrors Disponíveis");
                for (const mirror of mirrors) {
                    Logger.log(`  ${C.primary}•${C.reset} ${mirror.name} (${mirror.region})`);
                }
                break;
            }
            case "test": {
                Logger.section("Testando Mirrors");
                const tested = await manager.testAllMirrors();
                
                for (const mirror of tested.slice(0, 5)) {
                    const color = mirror.latency < 200 ? C.success : mirror.latency < 500 ? C.warning : C.error;
                    Logger.log(`  ${color}•${C.reset} ${mirror.name}: ${mirror.latency}ms`);
                }
                break;
            }
            default:
                Logger.error(`Ação desconhecida: ${subAction}`);
                Logger.info("Ações", "list, test");
        }
    }
}
