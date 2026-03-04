import { parseArgs } from "util";
import path from "path";
import fs from "fs";
import readline from "readline";
import { DEFAULT_TOMCAT_PORT, DEFAULT_DEBUG_PORT } from "./constants";
import type { AppConfig, CLIArguments, CommandContext } from "../types/config";
import { EmbeddedTomcatService } from "../services/EmbeddedTomcatService";
import { Logger } from "./ui";

export class ConfigManager {
    static async load(): Promise<CommandContext> {
        const args = Bun.argv.slice(Bun.argv[0].endsWith("bun.exe") || Bun.argv[0].endsWith("bun") ? 2 : 1);
        
        const { values, positionals } = parseArgs({
            args: args,
            options: {
                path: { type: "string", short: "p" },
                tool: { type: "string", short: "t" },
                name: { type: "string", short: "n" },
                port: { type: "string" },
                "no-build": { type: "boolean", short: "s" },
                "scan": { type: "boolean" },
                clean: { type: "boolean", short: "c" },
                quiet: { type: "boolean", short: "q" },
                help: { type: "boolean", short: "h" },
                version: { type: "boolean", short: "v" },
                debug: { type: "boolean", short: "d" },
                watch: { type: "boolean", short: "w" },
                profile: { type: "string", short: "P" },
                grep: { type: "string", short: "G" },
                verbose: { type: "boolean", short: "V" },
                encoding: { type: "string", short: "e" },
                dp: { type: "string" },
                fix: { type: "boolean" },
                tui: { type: "boolean" },
                output: { type: "string", short: "o" },
                strict: { type: "boolean" },
                "tomcat-version": { type: "string" },
            },
            strict: false,
            allowPositionals: true,
        });

        const cliValues = values as CLIArguments;

        // Load xavva.json
        const xavvaJsonPath = path.join(process.cwd(), "xavva.json");
        let xavvaJson: Partial<CLIArguments> = {};
        if (fs.existsSync(xavvaJsonPath)) {
            try {
                xavvaJson = JSON.parse(fs.readFileSync(xavvaJsonPath, "utf8"));
            } catch (e) {
                console.error("Error reading xavva.json:", (e as Error).message);
            }
        }

        const isDev = positionals.includes("dev");
        const isRun = positionals.includes("run") || positionals.includes("debug");
        const isStart = positionals.includes("start") || positionals.includes("deploy") || isDev;
        
        const envTomcatPath = process.env.TOMCAT_HOME || process.env.CATALINA_HOME;
        const detectedTool = this.detectBuildTool();

        let runClass = "";
        if (isRun) {
            const runIdx = positionals.indexOf("run");
            const debugIdx = positionals.indexOf("debug");
            const idx = runIdx !== -1 ? runIdx : debugIdx;
            runClass = positionals[idx + 1] || "";
        }

        // Detectar webapp path baseado no build tool
        const webappPath = detectedTool === "maven" 
            ? path.join(process.cwd(), "src", "main", "webapp")
            : path.join(process.cwd(), "src", "main", "webapp");

        // Verificar se usar Tomcat embutido
        let tomcatPath = String(cliValues.path || xavvaJson.path || envTomcatPath || "");
        let useEmbedded = false;
        let embeddedVersion = String(cliValues["tomcat-version"] || xavvaJson.version || "10.1.52");

        // Se não há Tomcat configurado ou não existe no path, usar embutido
        if (!tomcatPath || (!fs.existsSync(path.join(tomcatPath, "bin", "catalina.bat")) && isStart)) {
            useEmbedded = true;
            const embeddedService = new EmbeddedTomcatService({
                version: embeddedVersion,
                port: parseInt(String(cliValues.port || xavvaJson.port || String(DEFAULT_TOMCAT_PORT))),
                webappPath: webappPath
            });
            
            // Instala se necessário
            if (!embeddedService.checkInstallation()) {
                Logger.warn("Tomcat não encontrado!");
                Logger.info("Versão solicitada", embeddedVersion);
                Logger.newline();
                Logger.log(`${Logger.C.cyan}?${Logger.C.reset} Deseja instalar o Tomcat ${embeddedVersion} automaticamente?`);
                Logger.log(`${Logger.C.dim}  O download é de ~16MB e será salvo em:~/.xavva/tomcat/${embeddedVersion}${Logger.C.reset}`);
                Logger.newline();
                
                const shouldInstall = await this.askYesNo("Instalar");
                
                if (!shouldInstall) {
                    Logger.newline();
                    Logger.info("Opções disponíveis", "");
                    Logger.log(`  ${Logger.C.cyan}1.${Logger.C.reset} Defina TOMCAT_HOME ou CATALINA_HOME`);
                    Logger.log(`  ${Logger.C.cyan}2.${Logger.C.reset} Use --path para especificar o Tomcat`);
                    Logger.log(`  ${Logger.C.cyan}3.${Logger.C.reset} Use --tomcat-version para outra versão`);
                    Logger.newline();
                    process.exit(0);
                }
                
                Logger.newline();
                const installed = await embeddedService.install();
                if (!installed) {
                    Logger.error("Falha ao instalar Tomcat embutido.");
                    Logger.info("Dica", "Instale o Tomcat manualmente ou defina TOMCAT_HOME");
                    process.exit(1);
                }
            } else {
                Logger.info("Tomcat", `Usando versão embutida ${embeddedVersion}`);
            }
            
            // Configura contexto da aplicação
            await embeddedService.createAppContext();
            
            tomcatPath = embeddedService.getTomcatHome();
        }

        const config: AppConfig = {
            tomcat: {
                path: tomcatPath,
                port: parseInt(String(cliValues.port || xavvaJson.port || String(DEFAULT_TOMCAT_PORT))),
                webapps: "webapps",
                grep: cliValues.grep || xavvaJson.grep ? String(cliValues.grep || xavvaJson.grep) : "",
                embedded: useEmbedded,
                version: embeddedVersion,
            },
            project: {
                appName: cliValues.name || xavvaJson.name ? String(cliValues.name || xavvaJson.name) : "",
                buildTool: (cliValues.tool as any) || (xavvaJson.tool as any) || detectedTool,
                profile: String(cliValues.profile || xavvaJson.profile || ""),
                skipBuild: !!(cliValues["no-build"] ?? xavvaJson["no-build"]),
                skipScan: cliValues.scan !== undefined ? !cliValues.scan : (xavvaJson.scan !== undefined ? !xavvaJson.scan : true),
                clean: !!(cliValues.clean ?? xavvaJson.clean),
                cleanLogs: (cliValues.verbose ?? xavvaJson.verbose) ? false : true,
                quiet: (cliValues.verbose ?? xavvaJson.verbose) ? false : true,
                verbose: !!(cliValues.verbose ?? xavvaJson.verbose),
                debug: !!(cliValues.debug ?? xavvaJson.debug ?? isDev ?? isRun),
                debugPort: parseInt(String(cliValues.dp || xavvaJson.dp || String(DEFAULT_DEBUG_PORT))),
                grep: runClass || (cliValues.grep || xavvaJson.grep ? String(cliValues.grep || xavvaJson.grep) : ""),
                tui: !!(cliValues.tui ?? xavvaJson.tui),
                encoding: cliValues.encoding || xavvaJson.encoding || "",
            }
        };

        if (isDev) cliValues.watch = true;

        this.ensureGitIgnore();

        return { config, positionals, values: cliValues };
    }

    private static detectBuildTool(): "maven" | "gradle" {
        if (fs.existsSync(path.join(process.cwd(), "pom.xml"))) {
            return "maven";
        }
        if (fs.existsSync(path.join(process.cwd(), "build.gradle")) || fs.existsSync(path.join(process.cwd(), "build.gradle.kts"))) {
            return "gradle";
        }
        return "maven";
    }

    private static async askYesNo(question: string): Promise<boolean> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(`${question} [Y/n]: `, (answer) => {
                rl.close();
                const normalized = answer.trim().toLowerCase();
                resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
            });
        });
    }

    private static ensureGitIgnore() {
        const gitignorePath = path.join(process.cwd(), ".gitignore");

        if (!fs.existsSync(gitignorePath)) return;

        try {
            const content = fs.readFileSync(gitignorePath, "utf8");
            if (!content.includes(".xavva")) {
                const newContent = content.trim() + "\n\n# Xavva CLI\n.xavva/\n";
                fs.writeFileSync(gitignorePath, newContent);
            }
        } catch (e) {
        }
    }
}
