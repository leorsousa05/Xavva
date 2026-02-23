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
    cleanLogs: boolean;
    quiet: boolean;
    verbose: boolean;
    debug: boolean;
    grep?: string;
}

export interface AppConfig {
    tomcat: TomcatConfig;
    project: ProjectConfig;
}
