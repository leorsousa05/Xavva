export interface TomcatConfig {
    path: string;
    port: number;
    webapps: string;
    grep?: string;
}

export interface ProjectConfig {
    appName: string;
    buildTool: "maven" | "gradle";
    profile: string;
    skipBuild: boolean;
    skipScan: boolean;
    clean: boolean;
    quiet: boolean;
    verbose: boolean;
    debug: boolean;
    debugPort: number;
    cleanLogs: boolean;
    grep?: string;
}

export interface AppConfig {
    tomcat: TomcatConfig;
    project: ProjectConfig;
}

export interface CLIArguments {
    path?: string;
    tool?: string;
    name?: string;
    port?: string;
    "no-build"?: boolean;
    scan?: boolean;
    clean?: boolean;
    quiet?: boolean;
    help?: boolean;
    version?: boolean;
    debug?: boolean;
    watch?: boolean;
    profile?: string;
    grep?: string;
    verbose?: boolean;
    dp?: string;
    fix?: boolean;
    incremental?: boolean;
}

export interface CommandContext {
    config: AppConfig;
    positionals: string[];
    values: CLIArguments;
}
