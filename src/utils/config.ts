import { parseArgs } from "util";
import path from "path";
import fs from "fs";
import { DEFAULT_TOMCAT_PORT, DEFAULT_DEBUG_PORT } from "./constants";
import type { AppConfig, CLIArguments, CommandContext } from "../types/config";

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
        
        const envTomcatPath = process.env.TOMCAT_HOME || process.env.CATALINA_HOME || "C:\\apache-tomcat";
        const detectedTool = this.detectBuildTool();

        let runClass = "";
        if (isRun) {
            const runIdx = positionals.indexOf("run");
            const debugIdx = positionals.indexOf("debug");
            const idx = runIdx !== -1 ? runIdx : debugIdx;
            runClass = positionals[idx + 1] || "";
        }

        const config: AppConfig = {
            tomcat: {
                path: String(cliValues.path || xavvaJson.path || envTomcatPath),
                port: parseInt(String(cliValues.port || xavvaJson.port || String(DEFAULT_TOMCAT_PORT))),
                webapps: "webapps",
                grep: cliValues.grep || xavvaJson.grep ? String(cliValues.grep || xavvaJson.grep) : "",
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
