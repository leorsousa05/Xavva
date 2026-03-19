import { input, select, confirm, number } from "@inquirer/prompts";
import { writeFile, access } from "fs/promises";
import { join } from "path";
import { constants } from "fs";
import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../utils/ui";

export class InitCommand implements Command {
    async execute(_config: AppConfig, _args?: CLIArguments): Promise<void> {
        Logger.banner("init");
        Logger.section("Wizard de Configuração");
        Logger.info("Vamos configurar seu projeto Xavva");
        Logger.newline();

        // Detectar build tool
        const buildTool = await this.detectBuildTool();
        
        // Nome da aplicação
        const appName = await input({
            message: "Nome da aplicação:",
            default: process.cwd().split(/[/\\]/).pop() || "my-app",
            validate: (value) => value.length > 0 || "Nome é obrigatório"
        });

        // Profile
        const profile = await select({
            message: "Profile padrão:",
            choices: [
                { name: "desenvolvimento", value: "dev" },
                { name: "teste", value: "test" },
                { name: "produção", value: "prod" },
                { name: "customizado", value: "custom" }
            ],
            default: "dev"
        });

        const customProfile = profile === "custom" ? await input({
            message: "Nome do profile:",
            default: "local"
        }) : profile;

        // Porta do Tomcat
        const port = await number({
            message: "Porta do Tomcat:",
            default: 8080,
            validate: (value) => (value && value > 0 && value < 65536) || "Porta inválida"
        }) || 8080;

        // Configurações opcionais
        Logger.newline();
        Logger.dim("Configurações avançadas:");
        
        const useEmbedded = await confirm({
            message: "Usar Tomcat embutido (auto-download)?",
            default: true
        });

        const enableCache = await confirm({
            message: "Habilitar cache de build?",
            default: true
        });

        const enableTui = await confirm({
            message: "Habilitar dashboard TUI?",
            default: true
        });

        const encoding = await select({
            message: "Encoding:",
            choices: [
                { name: "UTF-8", value: "UTF-8" },
                { name: "ISO-8859-1", value: "ISO-8859-1" },
                { name: "Windows-1252", value: "Windows-1252" }
            ],
            default: "UTF-8"
        });

        // Montar configuração
        const config: Record<string, unknown> = {
            appName,
            buildTool,
            profile: customProfile,
            port,
            cache: enableCache,
            tui: enableTui,
            encoding
        };

        if (useEmbedded) {
            config.embedded = true;
            config.tomcatVersion = "10.1.52";
        } else {
            const tomcatPath = await input({
                message: "Caminho do Tomcat (CATALINA_HOME):",
                validate: async (value) => {
                    if (!value) return "Caminho é obrigatório";
                    try {
                        await access(value, constants.R_OK);
                        return true;
                    } catch {
                        return "Caminho não acessível";
                    }
                }
            });
            config.tomcatPath = tomcatPath;
        }

        // Salvar arquivo
        Logger.newline();
        Logger.step("Salvando configuração...");

        const configPath = join(process.cwd(), "xavva.json");
        await writeFile(configPath, JSON.stringify(config, null, 2));

        Logger.success(`Configuração salva em ${configPath}`);
        Logger.newline();
        Logger.ready("Projeto configurado!");
        Logger.info("Próximos passos:");
        Logger.log(`  ${Logger.C.gray}│${Logger.C.reset}  ${Logger.C.primary}xavva build${Logger.C.reset}  ${Logger.C.gray}- Compilar projeto${Logger.C.reset}`);
        Logger.log(`  ${Logger.C.gray}│${Logger.C.reset}  ${Logger.C.primary}xavva deploy${Logger.C.reset} ${Logger.C.gray}- Build + deploy${Logger.C.reset}`);
        Logger.log(`  ${Logger.C.gray}│${Logger.C.reset}  ${Logger.C.primary}xavva doctor${Logger.C.reset} ${Logger.C.gray}- Verificar ambiente${Logger.C.reset}`);
        Logger.done();
    }

    private async detectBuildTool(): Promise<"maven" | "gradle"> {
        try {
            await access(join(process.cwd(), "pom.xml"), constants.R_OK);
            Logger.info("Detectado: Projeto Maven");
            return "maven";
        } catch {
            try {
                await access(join(process.cwd(), "build.gradle"), constants.R_OK);
                Logger.info("Detectado: Projeto Gradle");
                return "gradle";
            } catch {
                const choice = await select({
                    message: "Build tool:",
                    choices: [
                        { name: "Maven", value: "maven" },
                        { name: "Gradle", value: "gradle" }
                    ]
                });
                return choice;
            }
        }
    }
}
