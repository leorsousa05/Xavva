import { parseArgs } from "util";
import { config as defaultConfig } from "../../config";
import type { AppConfig } from "../types/config";

export class ConfigManager {
    static load(): { config: AppConfig, positionals: string[], values: any } {
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
            },
            strict: false,
            allowPositionals: true,
        });

        const isDev = positionals.includes("dev");
        const isRun = positionals.includes("run") || positionals.includes("debug");
        const isDeploy = positionals.includes("deploy") || positionals.length === 0 || isDev;

        let runClass = "";
        if (isRun) {
            const runIdx = positionals.indexOf("run");
            const debugIdx = positionals.indexOf("debug");
            const idx = runIdx !== -1 ? runIdx : debugIdx;
            runClass = positionals[idx + 1] || "";
        }

        const config: AppConfig = {
            tomcat: {
                path: String(values.path || defaultConfig.tomcat.path),
                port: parseInt(String(values.port || defaultConfig.tomcat.port)),
                webapps: defaultConfig.tomcat.webapps,
                grep: values.grep ? String(values.grep) : "",
            },
            project: {
                appName: values.name ? String(values.name) : (defaultConfig.project.appName || ""),
                buildTool: (values.tool as "maven" | "gradle") || defaultConfig.project.buildTool,
                profile: String(values.profile || defaultConfig.project.profile || ""),
                skipBuild: !!values["no-build"],
                skipScan: !values.scan,
                cleanLogs: !!(values.clean || isDev),
                quiet: !!(values.quiet || isDev),
                verbose: !!values.verbose,
                debug: !!(values.debug || isDev || isRun),
                grep: runClass || (values.grep ? String(values.grep) : ""),
            }
        };

        if (isDev) values.watch = true;

        this.ensureGitIgnore();

        return { config, positionals, values };
    }

    private static ensureGitIgnore() {
        const fs = require("fs");
        const path = require("path");
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
