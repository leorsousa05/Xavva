import { parseArgs } from "util";
import path from "path";
import fs from "fs";
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
                dp: { type: "string" },
                fix: { type: "boolean" },
            },
            strict: false,
            allowPositionals: true,
        });

        const cliValues = values as CLIArguments;
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
                path: String(cliValues.path || envTomcatPath),
                port: parseInt(String(cliValues.port || "8080")),
                webapps: "webapps",
                grep: cliValues.grep ? String(cliValues.grep) : "",
            },
            project: {
                appName: cliValues.name ? String(cliValues.name) : "",
                buildTool: (cliValues.tool as "maven" | "gradle") || detectedTool,
                profile: String(cliValues.profile || ""),
                skipBuild: !!cliValues["no-build"],
                skipScan: cliValues.scan !== undefined ? !cliValues.scan : true,
                clean: !!cliValues.clean,
                cleanLogs: cliValues.verbose ? false : true,
                quiet: cliValues.verbose ? false : true,
                verbose: !!cliValues.verbose,
                debug: !!(cliValues.debug || isDev || isRun),
                debugPort: parseInt(String(cliValues.dp || "5005")),
                grep: runClass || (cliValues.grep ? String(cliValues.grep) : ""),
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
