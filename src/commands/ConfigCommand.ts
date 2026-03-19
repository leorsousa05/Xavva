import { input, select, confirm, number, editor } from "@inquirer/prompts";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../utils/ui";

export class ConfigCommand implements Command {
    async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
        const interactive = args?.["interactive"] || args?.["i"] || false;
        const configPath = join(process.cwd(), "xavva.json");

        if (!interactive) {
            // Modo view: mostrar configuração atual
            Logger.banner("config");
            Logger.section("Configuração Atual");
            
            Logger.config("App Name", config.project.appName);
            Logger.config("Build Tool", config.project.buildTool);
            Logger.config("Profile", config.project.profile);
            Logger.config("Port", config.tomcat.port);
            Logger.config("Cache", config.project.cache ?? true);
            Logger.config("TUI", config.project.tui);
            Logger.config("Encoding", config.project.encoding || "UTF-8");
            
            if (config.tomcat.embedded) {
                Logger.config("Tomcat", "embedded");
                Logger.config("Version", config.tomcat.version || "10.1.52");
            } else {
                Logger.config("Tomcat Path", config.tomcat.path);
            }

            Logger.endSection();
            Logger.dim("Use --interactive ou -i para editar");
            return;
        }

        // Modo interativo
        Logger.banner("config --interactive");
        Logger.section("Editor Interativo");

        if (!existsSync(configPath)) {
            Logger.warn("xavva.json não encontrado. Execute 'xavva init' primeiro.");
            return;
        }

        // Carregar config atual
        let currentConfig: Record<string, unknown>;
        try {
            const content = await readFile(configPath, "utf-8");
            currentConfig = JSON.parse(content);
        } catch {
            Logger.error("Erro ao ler xavva.json");
            return;
        }

        // Menu de opções
        const action = await select({
            message: "O que deseja editar?",
            choices: [
                { name: "Informações básicas (nome, profile)", value: "basic" },
                { name: "Configurações do Tomcat (porta, path)", value: "tomcat" },
                { name: "Opções de build (cache, encoding)", value: "build" },
                { name: "Editor de texto (JSON completo)", value: "json" }
            ]
        });

        switch (action) {
            case "basic":
                await this.editBasic(currentConfig);
                break;
            case "tomcat":
                await this.editTomcat(currentConfig);
                break;
            case "build":
                await this.editBuild(currentConfig);
                break;
            case "json":
                await this.editJson(currentConfig, configPath);
                return;
        }

        // Salvar
        await writeFile(configPath, JSON.stringify(currentConfig, null, 2));
        Logger.success("Configuração salva!");
    }

    private async editBasic(config: Record<string, unknown>): Promise<void> {
        config.appName = await input({
            message: "Nome da aplicação:",
            default: String(config.appName || "")
        });

        config.profile = await select({
            message: "Profile:",
            choices: [
                { name: "dev", value: "dev" },
                { name: "test", value: "test" },
                { name: "prod", value: "prod" },
                { name: "custom", value: "custom" }
            ],
            default: String(config.profile || "dev")
        });

        if (config.profile === "custom") {
            config.profile = await input({
                message: "Nome do profile:",
                default: "local"
            });
        }
    }

    private async editTomcat(config: Record<string, unknown>): Promise<void> {
        config.port = await number({
            message: "Porta:",
            default: Number(config.port || 8080)
        });

        const useEmbedded = await confirm({
            message: "Usar Tomcat embutido?",
            default: Boolean(config.embedded ?? true)
        });

        config.embedded = useEmbedded;

        if (useEmbedded) {
            config.tomcatVersion = await select({
                message: "Versão do Tomcat:",
                choices: [
                    { name: "10.1.52 (recomendada)", value: "10.1.52" },
                    { name: "9.0.115", value: "9.0.115" },
                    { name: "11.0.18", value: "11.0.18" }
                ],
                default: String(config.tomcatVersion || "10.1.52")
            });
            delete config.tomcatPath;
        } else {
            config.tomcatPath = await input({
                message: "Caminho do Tomcat:",
                default: String(config.tomcatPath || "")
            });
        }
    }

    private async editBuild(config: Record<string, unknown>): Promise<void> {
        config.cache = await confirm({
            message: "Habilitar cache de build?",
            default: Boolean(config.cache ?? true)
        });

        config.tui = await confirm({
            message: "Habilitar dashboard TUI?",
            default: Boolean(config.tui ?? true)
        });

        config.encoding = await select({
            message: "Encoding:",
            choices: [
                { name: "UTF-8", value: "UTF-8" },
                { name: "ISO-8859-1", value: "ISO-8859-1" },
                { name: "Windows-1252", value: "Windows-1252" }
            ],
            default: String(config.encoding || "UTF-8")
        });
    }

    private async editJson(config: Record<string, unknown>, path: string): Promise<void> {
        const current = JSON.stringify(config, null, 2);
        const edited = await editor({
            message: "Edite o JSON:",
            default: current,
            postfix: ".json"
        });

        try {
            const parsed = JSON.parse(edited);
            await writeFile(path, JSON.stringify(parsed, null, 2));
            Logger.success("Configuração salva!");
        } catch {
            Logger.error("JSON inválido!");
        }
    }
}
