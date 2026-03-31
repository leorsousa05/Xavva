/**
 * Gerenciamento de configuração do XAVVA CLI
 * 
 * Responsabilidades:
 * - Parse de argumentos CLI
 * - Load de xavva.json
 * - Setup de Tomcat embutido
 * - Merge de configurações (CLI > xavva.json > env > defaults)
 * - Validação com Zod
 */

import { parseArgs } from "util";
import path from "path";
import fs from "fs";
import { PORTS } from "../config/versions";
import type { AppConfig, CLIArguments, CommandContext } from "../types/config";
import { EmbeddedTomcatService } from "../services/EmbeddedTomcatService";
import { Logger, C } from "./ui";
import { validateAppConfig, validatePort, type ValidatedAppConfig } from "../types/configSchema";

// Parse options extraídas para reuso
const PARSE_OPTIONS = {
    path: { type: "string" as const, short: "p" },
    tool: { type: "string" as const, short: "t" },
    name: { type: "string" as const, short: "n" },
    port: { type: "string" as const },
    "no-build": { type: "boolean" as const, short: "s" },
    scan: { type: "boolean" as const },
    clean: { type: "boolean" as const, short: "c" },
    quiet: { type: "boolean" as const, short: "q" },
    help: { type: "boolean" as const, short: "h" },
    version: { type: "boolean" as const, short: "v" },
    debug: { type: "boolean" as const, short: "d" },
    watch: { type: "boolean" as const, short: "w" },
    profile: { type: "string" as const, short: "P" },
    grep: { type: "string" as const, short: "G" },
    verbose: { type: "boolean" as const, short: "V" },
    encoding: { type: "string" as const, short: "e" },
    dp: { type: "string" as const },
    fix: { type: "boolean" as const },
    tui: { type: "boolean" as const },
    output: { type: "string" as const, short: "o" },
    strict: { type: "boolean" as const },
    "tomcat-version": { type: "string" as const },
    yes: { type: "boolean" as const, short: "y" },
    war: { type: "boolean" as const, short: "W" },
    cache: { type: "boolean" as const },
    from: { type: "string" as const },
    to: { type: "string" as const },
    backup: { type: "boolean" as const },
    "dry-run": { type: "boolean" as const },
    force: { type: "boolean" as const },
    src: { type: "string" as const },
    env: { type: "string" as const },
    environment: { type: "string" as const },
    coverage: { type: "boolean" as const },
    "fail-fast": { type: "boolean" as const },
    parallel: { type: "boolean" as const },
    interactive: { type: "boolean" as const, short: "i" },
    "base-url": { type: "string" as const },
    body: { type: "string" as const },
    file: { type: "string" as const },
    header: { type: "string" as const, multiple: true },
    "content-type": { type: "string" as const },
    accept: { type: "string" as const },
    param: { type: "string" as const, multiple: true },
    timeout: { type: "string" as const },
    tag: { type: "string" as const },
    "java-version": { type: "string" as const },
    detached: { type: "boolean" as const, short: "d" },
    registry: { type: "string" as const },
    namespace: { type: "string" as const },
    // Clean command
    all: { type: "boolean" as const },
    build: { type: "boolean" as const },
    // IDE command
    ide: { type: "string" as const },
};

export class ConfigManager {
    /**
     * Carrega e valida configuração completa
     */
    static async load(): Promise<CommandContext> {
        const argv = this.getArgv();
        const { values, positionals } = this.parseCliArgs(argv);
        const cliValues = values as CLIArguments;

        // Detectar contexto
        const commandContext = this.detectCommandContext(positionals);
        
        // Carregar configs de diferentes fontes
        const fileConfig = await this.loadConfigFile();
        const envConfig = this.loadEnvConfig();
        
        // Merge de configurações (prioridade: CLI > env > file > defaults)
        const mergedConfig = await this.mergeConfigurations({
            cli: cliValues,
            file: fileConfig,
            env: envConfig,
            context: commandContext,
        });

        // Setup de Tomcat embutido se necessário
        const finalConfig = await this.setupTomcatIfNeeded(mergedConfig, cliValues, commandContext);

        // Validar configuração final
        const validatedConfig = this.validateConfig(finalConfig);

        // Ajustes baseados no comando
        if (commandContext.isDev) {
            cliValues.watch = true;
        }

        this.ensureGitIgnore();

        return { 
            config: validatedConfig, 
            positionals, 
            values: cliValues 
        };
    }

    /**
     * Obtém argumentos do processo
     */
    private static getArgv(): string[] {
        const isBun = Bun.argv[0].endsWith("bun.exe") || Bun.argv[0].endsWith("bun");
        return Bun.argv.slice(isBun ? 2 : 1);
    }

    /**
     * Parse de argumentos CLI
     */
    private static parseCliArgs(argv: string[]) {
        return parseArgs({
            args: argv,
            options: PARSE_OPTIONS,
            strict: false,
            allowPositionals: true,
        });
    }

    /**
     * Detecta contexto do comando atual
     */
    private static detectCommandContext(positionals: string[]) {
        const isDev = positionals.includes("dev");
        const isRun = positionals.includes("run") || positionals.includes("debug");
        const isStart = positionals.includes("start") || positionals.includes("deploy") || isDev;
        
        let runClass = "";
        if (isRun) {
            const runIdx = positionals.indexOf("run");
            const debugIdx = positionals.indexOf("debug");
            const idx = runIdx !== -1 ? runIdx : debugIdx;
            runClass = positionals[idx + 1] || "";
        }

        return {
            isDev,
            isRun,
            isStart,
            runClass,
        };
    }

    /**
     * Carrega configuração do arquivo xavva.json
     */
    private static async loadConfigFile(): Promise<Partial<CLIArguments>> {
        const xavvaJsonPath = path.join(process.cwd(), "xavva.json");
        
        if (!fs.existsSync(xavvaJsonPath)) {
            return {};
        }

        try {
            const content = fs.readFileSync(xavvaJsonPath, "utf8");
            return JSON.parse(content);
        } catch (e) {
            console.error("Erro ao ler xavva.json:", (e as Error).message);
            return {};
        }
    }

    /**
     * Carrega configuração de variáveis de ambiente
     */
    private static loadEnvConfig(): { tomcatPath?: string } {
        return {
            tomcatPath: process.env.TOMCAT_HOME || process.env.CATALINA_HOME,
        };
    }

    /**
     * Detecta build tool do projeto
     */
    private static detectBuildTool(): "maven" | "gradle" {
        const cwd = process.cwd();
        
        if (fs.existsSync(path.join(cwd, "pom.xml"))) {
            return "maven";
        }
        if (fs.existsSync(path.join(cwd, "build.gradle")) || 
            fs.existsSync(path.join(cwd, "build.gradle.kts"))) {
            return "gradle";
        }
        
        return "maven";
    }

    /**
     * Merge de todas as configurações
     */
    private static async mergeConfigurations({
        cli,
        file,
        env,
        context,
    }: {
        cli: CLIArguments;
        file: Partial<CLIArguments>;
        env: { tomcatPath?: string };
        context: { isDev: boolean; isRun: boolean; isStart: boolean; runClass: string };
    }): Promise<AppConfig> {
        const detectedTool = this.detectBuildTool();
        const environment = String(cli.env || cli.environment || file.env || file.environment || "");
        const envConfig = environment && (file as any).environments?.[environment];

        // Versão do Tomcat
        const xavvaTomcatVersion = (file as any).tomcat?.version;
        const embeddedVersion = String(cli["tomcat-version"] || xavvaTomcatVersion || file.version || "10.1.52");

        // Porta
        const finalPort = envConfig?.port 
            ? validatePort(envConfig.port)
            : validatePort(cli.port || file.port || PORTS.DEFAULT_TOMCAT);

        // Profile
        const finalProfile = envConfig?.profile || String(cli.profile || file.profile || "");

        // Tomcat path
        let tomcatPath = String(cli.path || file.path || env.tomcatPath || "");

        return {
            tomcat: {
                path: tomcatPath,
                port: finalPort,
                webapps: "webapps",
                grep: cli.grep || file.grep ? String(cli.grep || file.grep) : "",
                embedded: false, // Será atualizado no setupTomcatIfNeeded
                version: embeddedVersion,
                ...(envConfig?.tomcat || {}),
            },
            project: {
                appName: cli.name || file.name ? String(cli.name || file.name) : "",
                buildTool: (cli.tool as any) || (file.tool as any) || detectedTool,
                profile: finalProfile,
                skipBuild: !!(cli["no-build"] ?? file["no-build"]),
                skipScan: cli.scan !== undefined ? !cli.scan : (file.scan !== undefined ? !file.scan : true),
                clean: !!(cli.clean ?? file.clean),
                cleanLogs: (cli.verbose ?? file.verbose) ? false : true,
                quiet: (cli.verbose ?? file.verbose) ? false : true,
                verbose: !!(cli.verbose ?? file.verbose),
                debug: !!(cli.debug ?? file.debug ?? context.isDev ?? context.isRun),
                debugPort: validatePort(cli.dp || file.dp || PORTS.DEFAULT_DEBUG),
                grep: context.runClass || (cli.grep || file.grep ? String(cli.grep || file.grep) : ""),
                tui: !!(cli.tui ?? file.tui),
                encoding: cli.encoding || file.encoding || "",
                war: !!(cli.war ?? file.war),
                cache: !!(cli.cache ?? file.cache),
                environment,
                environments: (file as any).environments,
            },
        };
    }

    /**
     * Setup de Tomcat embutido se necessário
     */
    private static async setupTomcatIfNeeded(
        config: AppConfig,
        cliValues: CLIArguments,
        context: { isStart: boolean }
    ): Promise<AppConfig> {
        const hasCatalina = fs.existsSync(path.join(config.tomcat.path, "bin", "catalina.bat")) ||
                           fs.existsSync(path.join(config.tomcat.path, "bin", "catalina.sh"));

        // Se já tem Tomcat válido ou não precisa iniciar, retorna config atual
        if ((config.tomcat.path && hasCatalina) || !context.isStart) {
            return config;
        }

        // Usar Tomcat embutido
        const embeddedService = new EmbeddedTomcatService({
            version: config.tomcat.version,
            port: config.tomcat.port,
            webappPath: path.join(process.cwd(), "src", "main", "webapp"),
        });

        if (!embeddedService.checkInstallation()) {
            const shouldInstall = await this.promptForTomcatInstall(config.tomcat.version, cliValues.yes);
            
            if (!shouldInstall) {
                this.printTomcatHelp();
                process.exit(0);
            }

            const installed = await embeddedService.install();
            if (!installed) {
                Logger.error("Falha ao instalar Tomcat embutido.");
                Logger.info("Dica", "Instale o Tomcat manualmente ou defina TOMCAT_HOME");
                process.exit(1);
            }
        } else {
            Logger.info("Tomcat", `Usando versão embutida ${config.tomcat.version}`);
        }

        await embeddedService.createAppContext();

        return {
            ...config,
            tomcat: {
                ...config.tomcat,
                path: embeddedService.getTomcatHome(),
                embedded: true,
            },
        };
    }

    /**
     * Prompt para instalação do Tomcat
     */
    private static async promptForTomcatInstall(version: string, autoYes?: boolean): Promise<boolean> {
        Logger.newline();
        Logger.warn("Tomcat não encontrado!");
        Logger.info("Versão solicitada", version);
        Logger.newline();
        Logger.log(`${C.primary}?${C.reset} Deseja instalar o Tomcat ${version} automaticamente?`);
        Logger.log(`${C.dim}  O download é de ~16MB e será salvo em:~/.xavva/tomcat/${version}${C.reset}`);
        Logger.newline();

        await new Promise(resolve => setTimeout(resolve, 50));
        process.stdout.write('\r\x1b[K');

        if (autoYes) return true;

        return this.askYesNo("Instalar");
    }

    /**
     * Print opções de ajuda para Tomcat
     */
    private static printTomcatHelp(): void {
        Logger.newline();
        Logger.info("Opções disponíveis", "");
        Logger.log(`  ${C.primary}1.${C.reset} Defina TOMCAT_HOME ou CATALINA_HOME`);
        Logger.log(`  ${C.primary}2.${C.reset} Use --path para especificar o Tomcat`);
        Logger.log(`  ${C.primary}3.${C.reset} Use --tomcat-version para outra versão`);
        Logger.newline();
    }

    /**
     * Valida configuração com Zod
     */
    private static validateConfig(config: AppConfig): AppConfig {
        try {
            return validateAppConfig(config);
        } catch (error) {
            Logger.error("Configuração inválida:");
            Logger.error((error as Error).message);
            process.exit(1);
        }
    }

    /**
     * Prompt yes/no
     */
    private static async askYesNo(question: string): Promise<boolean> {
        await new Promise(resolve => setTimeout(resolve, 100));
        process.stdout.write('\x1b[0m');

        return new Promise((resolve) => {
            const chunks: Buffer[] = [];

            const cleanup = () => {
                process.stdin.removeListener('data', onData);
                process.stdin.removeListener('end', onEnd);
                process.stdin.pause();
            };

            const onData = (data: Buffer) => {
                chunks.push(data);
                const str = Buffer.concat(chunks).toString();

                if (str.includes('\n') || str.includes('\r')) {
                    cleanup();
                    const answer = str.replace(/\r?\n/g, '').trim().toLowerCase();
                    process.stdout.write('\n');
                    resolve(answer === '' || answer === 'y' || answer === 'yes');
                }
            };

            const onEnd = () => {
                cleanup();
                const answer = Buffer.concat(chunks).toString().trim().toLowerCase();
                resolve(answer === '' || answer === 'y' || answer === 'yes');
            };

            process.stdout.write(`${question} [Y/n]: `);
            process.stdin.resume();
            process.stdin.on('data', onData);
            process.stdin.on('end', onEnd);
        });
    }

    /**
     * Garante que .xavva está no .gitignore
     */
    private static ensureGitIgnore(): void {
        const gitignorePath = path.join(process.cwd(), ".gitignore");

        if (!fs.existsSync(gitignorePath)) return;

        try {
            const content = fs.readFileSync(gitignorePath, "utf8");
            if (!content.includes(".xavva")) {
                const newContent = content.trim() + "\n\n# Xavva CLI\n.xavva/\n";
                fs.writeFileSync(gitignorePath, newContent);
            }
        } catch (e) {
            // Silently fail
        }
    }
}
