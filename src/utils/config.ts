import { parseArgs } from "util";
import path from "path";
import fs from "fs";
import type { AppConfig } from "../types/config";

const DEFAULT_CONFIG: AppConfig = {
    tomcat: {
        path: "C:\\apache-tomcat",
        port: 8080,
        webapps: "webapps",
    },
    project: {
        appName: "",
        buildTool: "maven",
        profile: "",
        skipBuild: false,
        skipScan: false,
        cleanLogs: false,
        quiet: false,
        verbose: false,
        debug: false,
    }
};

export class ConfigManager {
    static async load(): Promise<{ config: AppConfig, positionals: string[], values: any }> {
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
                init: { type: "boolean" },
            },
            strict: false,
            allowPositionals: true,
        });

        if (values.init) {
            await this.initConfigFile();
            process.exit(0);
        }

        const externalConfig = await this.loadExternalConfig();
        const baseConfig = externalConfig || DEFAULT_CONFIG;

        const isDev = positionals.includes("dev");
        const isRun = positionals.includes("run") || positionals.includes("debug");

        let runClass = "";
        if (isRun) {
            const runIdx = positionals.indexOf("run");
            const debugIdx = positionals.indexOf("debug");
            const idx = runIdx !== -1 ? runIdx : debugIdx;
            runClass = positionals[idx + 1] || "";
        }

        const config: AppConfig = {
            tomcat: {
                path: String(values.path || baseConfig.tomcat.path),
                port: parseInt(String(values.port || baseConfig.tomcat.port)),
                webapps: baseConfig.tomcat.webapps,
                grep: values.grep ? String(values.grep) : (baseConfig.tomcat.grep || ""),
            },
            project: {
                appName: values.name ? String(values.name) : (baseConfig.project.appName || ""),
                buildTool: (values.tool as "maven" | "gradle") || baseConfig.project.buildTool,
                profile: String(values.profile || baseConfig.project.profile || ""),
                skipBuild: !!(values["no-build"] || baseConfig.project.skipBuild),
                skipScan: values.scan !== undefined ? !values.scan : (baseConfig.project.skipScan ?? true),
                cleanLogs: !!(values.clean || isDev || baseConfig.project.cleanLogs),
                quiet: !!(values.quiet || isDev || baseConfig.project.quiet),
                verbose: !!(values.verbose || baseConfig.project.verbose),
                debug: !!(values.debug || isDev || isRun || baseConfig.project.debug),
                grep: runClass || (values.grep ? String(values.grep) : (baseConfig.project.grep || "")),
            }
        };

        if (isDev) values.watch = true;

        this.ensureGitIgnore();

        return { config, positionals, values };
    }

    private static async loadExternalConfig(): Promise<AppConfig | null> {
        const configPath = path.join(process.cwd(), "xavva.config.ts");
        const jsonPath = path.join(process.cwd(), "xavva.json");

        try {
            if (fs.existsSync(configPath)) {
                const module = await import(configPath);
                return module.config || module.default || null;
            }
            if (fs.existsSync(jsonPath)) {
                const content = fs.readFileSync(jsonPath, "utf8");
                return JSON.parse(content);
            }
        } catch (e) {
            console.error(`\x1b[31mError loading configuration file:\x1b[0m`, e);
        }

        return null;
    }

    private static async initConfigFile() {
        const configPath = path.join(process.cwd(), "xavva.config.ts");
        if (fs.existsSync(configPath)) {
            console.log("\x1b[33mConfiguration file 'xavva.config.ts' already exists.\x1b[0m");
            return;
        }

        const content = `export const config = {
    tomcat: {
        path: "C:\\\\apache-tomcat",
        port: 8080,
        webapps: "webapps",
    },
    project: {
        appName: "",
        buildTool: "maven",
        profile: "",
    },
};
`;
        fs.writeFileSync(configPath, content);
        console.log("\x1b[32m✔ Created 'xavva.config.ts' with default values.\x1b[0m");
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
