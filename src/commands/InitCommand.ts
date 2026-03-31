/**
 * InitCommand - Wizard de inicialização de projeto
 * 
 * Detecta automaticamente:
 * - Tipo de projeto (Maven/Gradle)
 * - Framework (Spring Boot vs Java EE/Jakarta EE)
 * - Versão do Java
 * - Configurações existentes
 */
import { input, select, confirm, number } from "@inquirer/prompts";
import { writeFile, access, readFile } from "fs/promises";
import { join } from "path";
import { constants, existsSync } from "fs";
import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../logging";

export interface ProjectInfo {
    buildTool: "maven" | "gradle";
    isSpringBoot: boolean;
    javaVersion: string;
    hasWebapp: boolean;
    hasApplicationClass: boolean;
    packageName: string;
    profiles: string[];
}

export class InitCommand implements Command {
    private logger = Logger.getInstance();

    async execute(_config: AppConfig, _args?: CLIArguments): Promise<void> {
        this.logger.section("🚀 XAVVA Project Setup");
        this.logger.newline();

        // Detecta informações do projeto
        const projectInfo = await this.analyzeProject();
        
        // Mostra resumo da detecção
        this.showDetectionSummary(projectInfo);
        this.logger.newline();

        // Configurações básicas
        const appName = await input({
            message: "Nome da aplicação:",
            default: process.cwd().split(/[/\\]/).pop() || "my-app",
            validate: (value) => value.length > 0 || "Nome é obrigatório"
        });

        // Tipo de execução
        const executionMode = await this.selectExecutionMode(projectInfo);

        // Porta
        const port = await number({
            message: "Porta do servidor:",
            default: 8080,
            validate: (value) => (value && value > 0 && value < 65536) || "Porta inválida"
        }) || 8080;

        // Perfil
        const profile = await this.selectProfile(projectInfo);

        // Encoding
        const encoding = await select({
            message: "Encoding dos arquivos:",
            choices: [
                { name: "UTF-8 (recomendado)", value: "UTF-8" },
                { name: "ISO-8859-1 (Latin-1)", value: "ISO-8859-1" },
                { name: "Windows-1252", value: "Windows-1252" }
            ],
            default: "UTF-8"
        });

        // Configurações avançadas
        const advanced = await this.configureAdvancedOptions();

        // Monta configuração
        const config = this.buildConfig({
            appName,
            projectInfo,
            executionMode,
            port,
            profile,
            encoding,
            advanced
        });

        // Salva arquivo
        await this.saveConfig(config);

        // Mostra próximos passos
        this.showNextSteps(executionMode, projectInfo);
    }

    /**
     * Analisa o projeto automaticamente
     */
    private async analyzeProject(): Promise<ProjectInfo> {
        const info: ProjectInfo = {
            buildTool: "maven",
            isSpringBoot: false,
            javaVersion: "",
            hasWebapp: false,
            hasApplicationClass: false,
            packageName: "",
            profiles: []
        };

        // Detecta build tool
        const hasPom = existsSync(join(process.cwd(), "pom.xml"));
        const hasGradle = existsSync(join(process.cwd(), "build.gradle")) || 
                          existsSync(join(process.cwd(), "build.gradle.kts"));

        if (hasGradle && !hasPom) {
            info.buildTool = "gradle";
        } else if (hasPom && hasGradle) {
            // Pergunta qual usar
            const choice = await select({
                message: "Detectado pom.xml e build.gradle. Qual usar?",
                choices: [
                    { name: "Maven (pom.xml)", value: "maven" as const },
                    { name: "Gradle (build.gradle)", value: "gradle" as const }
                ]
            });
            info.buildTool = choice;
        }

        // Analisa arquivo de build
        if (info.buildTool === "maven") {
            await this.analyzeMavenProject(info);
        } else {
            await this.analyzeGradleProject(info);
        }

        // Verifica estrutura de diretórios
        info.hasWebapp = existsSync(join(process.cwd(), "src/main/webapp"));
        
        // Procura classe Application do Spring Boot
        info.hasApplicationClass = await this.findApplicationClass(info);

        return info;
    }

    /**
     * Analiza projeto Maven
     */
    private async analyzeMavenProject(info: ProjectInfo): Promise<void> {
        const pomPath = join(process.cwd(), "pom.xml");
        if (!existsSync(pomPath)) return;

        try {
            const content = await readFile(pomPath, "utf-8");
            
            // Detecta Spring Boot
            info.isSpringBoot = content.includes("spring-boot") || 
                               content.includes("spring-boot-starter");

            // Extrai versão do Java
            const javaVersionMatch = content.match(/<java\.version>(\d+)<\/java\.version>/);
            const mavenCompilerMatch = content.match(/<maven\.compiler\.source>(\d+)<\/maven\.compiler\.source>/);
            info.javaVersion = javaVersionMatch?.[1] || mavenCompilerMatch?.[1] || "";

            // Extrai profiles
            const profileMatches = content.matchAll(/<profile>[\s\S]*?<id>([^<]+)<\/id>[\s\S]*?<\/profile>/g);
            for (const match of profileMatches) {
                info.profiles.push(match[1].trim());
            }

            // Extrai package name do groupId + artifactId
            const groupIdMatch = content.match(/<groupId>([^<]+)<\/groupId>/);
            const artifactIdMatch = content.match(/<artifactId>([^<]+)<\/artifactId>/);
            if (groupIdMatch) {
                info.packageName = groupIdMatch[1];
            }
        } catch {}
    }

    /**
     * Analisa projeto Gradle
     */
    private async analyzeGradleProject(info: ProjectInfo): Promise<void> {
        const gradlePath = join(process.cwd(), "build.gradle");
        const gradleKtsPath = join(process.cwd(), "build.gradle.kts");
        const gradleFile = existsSync(gradlePath) ? gradlePath : gradleKtsPath;
        
        if (!existsSync(gradleFile)) return;

        try {
            const content = await readFile(gradleFile, "utf-8");
            
            // Detecta Spring Boot
            info.isSpringBoot = content.includes("spring-boot") ||
                               content.includes("org.springframework.boot");

            // Extrai versão do Java
            const javaVersionMatch = content.match(/sourceCompatibility\s*=\s*['"](\d+)['"]/);
            const javaToolchainMatch = content.match(/languageVersion\s*=\s*JavaLanguageVersion\.of\((\d+)\)/);
            info.javaVersion = javaVersionMatch?.[1] || javaToolchainMatch?.[1] || "";

            // Extrai group
            const groupMatch = content.match(/group\s*=\s*['"]([^'"]+)['"]/);
            if (groupMatch) {
                info.packageName = groupMatch[1];
            }
        } catch {}
    }

    /**
     * Procura classe Application do Spring Boot
     */
    private async findApplicationClass(info: ProjectInfo): Promise<boolean> {
        const srcDir = join(process.cwd(), "src/main/java");
        if (!existsSync(srcDir)) return false;

        try {
            // Procura arquivos que importam Spring Boot
            const files = await readFile(srcDir, "utf-8");
            // Simplificação - na prática usaria glob
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Mostra resumo da detecção
     */
    private showDetectionSummary(info: ProjectInfo): void {
        this.logger.info("Detecção automática:");
        this.logger.config("Build tool", info.buildTool);
        this.logger.config("Framework", info.isSpringBoot ? "Spring Boot" : "Java EE/Jakarta EE");
        if (info.javaVersion) {
            this.logger.config("Java version", info.javaVersion);
        }
        if (info.profiles.length > 0) {
            this.logger.config("Profiles", info.profiles.join(", "));
        }
        if (info.hasWebapp) {
            this.logger.config("Webapp", "Detectado");
        }
    }

    /**
     * Seleciona modo de execução
     */
    private async selectExecutionMode(info: ProjectInfo): Promise<string> {
        const choices: Array<{ name: string; value: string; description?: string }> = [];

        if (info.isSpringBoot) {
            choices.push({
                name: "🚀 Spring Boot (embedded Tomcat)",
                value: "springboot",
                description: "Executa via classe Application com Tomcat embutido"
            });
        }

        choices.push({
            name: "🐱 Tomcat Embutido (Xavva)",
            value: "embedded",
            description: "Xavva gerencia Tomcat automaticamente"
        });

        choices.push({
            name: "🌐 Tomcat Externo",
            value: "external",
            description: "Usa instalação existente do Tomcat"
        });

        if (info.hasWebapp) {
            choices.push({
                name: "📁 WAR Deploy",
                value: "war",
                description: "Build e deploy como arquivo WAR"
            });
        }

        const defaultValue = info.isSpringBoot ? "springboot" : "embedded";

        return await select({
            message: "Modo de execução:",
            choices,
            default: defaultValue
        });
    }

    /**
     * Seleciona perfil
     */
    private async selectProfile(info: ProjectInfo): Promise<string> {
        if (info.profiles.length > 0) {
            return await select({
                message: "Perfil padrão:",
                choices: [
                    ...info.profiles.map(p => ({ name: p, value: p })),
                    { name: "Outro (custom)", value: "custom" }
                ],
                default: info.profiles.includes("dev") ? "dev" : info.profiles[0]
            });
        }

        return await select({
            message: "Perfil padrão:",
            choices: [
                { name: "dev - Desenvolvimento", value: "dev" },
                { name: "test - Testes", value: "test" },
                { name: "prod - Produção", value: "prod" },
                { name: "Outro", value: "custom" }
            ],
            default: "dev"
        });
    }

    /**
     * Configura opções avançadas
     */
    private async configureAdvancedOptions(): Promise<{
        cache: boolean;
        tui: boolean;
        hotReload: boolean;
        multiEnv: boolean;
    }> {
        this.logger.newline();
        this.logger.info("Configurações avançadas:");

        const cache = await confirm({
            message: "Habilitar cache de build?",
            default: true
        });

        const tui = await confirm({
            message: "Habilitar dashboard TUI?",
            default: true
        });

        const hotReload = await confirm({
            message: "Habilitar hot-reload?",
            default: true
        });

        const multiEnv = await confirm({
            message: "Configurar múltiplos ambientes?",
            default: false
        });

        return { cache, tui, hotReload, multiEnv };
    }

    /**
     * Monta configuração final
     */
    private buildConfig(params: {
        appName: string;
        projectInfo: ProjectInfo;
        executionMode: string;
        port: number;
        profile: string;
        encoding: string;
        advanced: {
            cache: boolean;
            tui: boolean;
            hotReload: boolean;
            multiEnv: boolean;
        };
    }): Record<string, unknown> {
        const { appName, projectInfo, executionMode, port, profile, encoding, advanced } = params;

        // Configuração base
        const config: Record<string, unknown> = {
            appName,
            buildTool: projectInfo.buildTool,
            profile: profile === "custom" ? "dev" : profile,
            port,
            encoding,
            cache: advanced.cache,
            tui: advanced.tui,
            hotReload: advanced.hotReload
        };

        // Configuração específica por modo
        switch (executionMode) {
            case "springboot":
                config.executionMode = "springboot";
                config.springBoot = {
                    mainClass: "",
                    args: ""
                };
                break;

            case "embedded":
                config.executionMode = "embedded";
                config.tomcat = {
                    embedded: true,
                    version: "10.1.52"
                };
                break;

            case "external":
                config.executionMode = "external";
                config.tomcat = {
                    embedded: false,
                    path: "${CATALINA_HOME}"
                };
                break;

            case "war":
                config.executionMode = "war";
                config.war = true;
                config.tomcat = {
                    embedded: true,
                    version: "9.0.115"
                };
                break;
        }

        // Ambientes múltiplos
        if (advanced.multiEnv) {
            config.environments = {
                dev: {
                    port,
                    profile: "dev"
                },
                test: {
                    port: port + 1,
                    profile: "test"
                }
            };
        }

        return config;
    }

    /**
     * Salva configuração no arquivo
     */
    private async saveConfig(config: Record<string, unknown>): Promise<void> {
        this.logger.newline();
        this.logger.step("Salvando configuração...");

        const configPath = join(process.cwd(), "xavva.json");
        await writeFile(configPath, JSON.stringify(config, null, 2));

        this.logger.success(`Configuração salva em ${configPath}`);
        this.logger.newline();
    }

    /**
     * Mostra próximos passos
     */
    private showNextSteps(executionMode: string, info: ProjectInfo): void {
        this.logger.section("✅ Projeto configurado!");
        this.logger.newline();

        this.logger.info("Próximos passos:");

        if (executionMode === "springboot") {
            console.log("  │");
            console.log("  ├─ 🚀 Para Spring Boot:");
            console.log("  │   xavva dev          # Inicia com hot-reload");
            console.log("  │   xavva run          # Executa classe principal");
            console.log("  │   xavva debug        # Debug na porta 5005");
        } else {
            console.log("  │");
            console.log("  ├─ 🐱 Para Tomcat:");
            console.log("  │   xavva dev          # Build + deploy + watch");
            console.log("  │   xavva deploy       # Build e deploy");
            console.log("  │   xavva tomcat list  # Ver versões disponíveis");
        }

        console.log("  │");
        console.log("  ├─ 📋 Comandos úteis:");
        console.log("  │   xavva build        # Compila projeto");
        console.log("  │   xavva test         # Executa testes");
        console.log("  │   xavva health       # Verifica ambiente");
        console.log("  │   xavva --help       # Ajuda completa");

        if (info.isSpringBoot && !info.hasApplicationClass) {
            this.logger.newline();
            this.logger.warn("⚠️  Não detectei a classe @SpringBootApplication");
            this.logger.info("Adicione no xavva.json:");
            console.log('  "springBoot": {');
            console.log('    "mainClass": "com.example.MinhaAplicacao"');
            console.log('  }');
        }

        this.logger.newline();
        this.logger.ready("Pronto para desenvolver! 🎉");
    }
}
