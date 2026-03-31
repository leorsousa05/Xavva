export interface EnvironmentConfig {
    port?: number;
    profile?: string;
    db?: {
        url?: string;
        username?: string;
        password?: string;
        driver?: string;
    };
    tomcat?: Partial<TomcatConfig>;
    env?: Record<string, string>;
}

export interface TomcatConfig {
    path: string;
    port: number;
    webapps: string;
    grep?: string;
    embedded?: boolean;
    version?: string;
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
    tui: boolean;
    encoding?: string;
    war?: boolean;
    cache?: boolean;
    environment?: string;
    environments?: Record<string, EnvironmentConfig>;
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
    encoding?: string;
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
    tui?: boolean;
    output?: string;
    strict?: boolean;
    "tomcat-version"?: string;
    "tomcat-action"?: string;
    "update-safe"?: boolean;
    "updateSafe"?: boolean;
    yes?: boolean;
    war?: boolean;
    cache?: boolean;
    changedFiles?: string[];
    from?: string;
    to?: string;
    backup?: boolean;
    "dry-run"?: boolean;
    force?: boolean;
    src?: string;
    // Multi-environment
    env?: string;
    environment?: string;
    // Test runner
    coverage?: boolean;
    "fail-fast"?: boolean;
    parallel?: boolean;
    // HTTP client
    interactive?: boolean;
    "base-url"?: string;
    body?: string;
    file?: string;
    header?: string | string[];
    "content-type"?: string;
    accept?: string;
    param?: string | string[];
    timeout?: string;
    // Docker
    tag?: string;
    "java-version"?: string;
    detached?: boolean;
    registry?: string;
    namespace?: string;
    // Debug options
    "attach-later"?: boolean;
    wait?: string;
    prompt?: boolean;
    // Build options for run command
    fast?: boolean;
    "no-build"?: boolean;
    build?: boolean;
    // Spring Boot options
    "execution-mode"?: string;
    "main-class"?: string;
    args?: string;

export interface CommandContext {
    config: AppConfig;
    positionals: string[];
    values: CLIArguments;
}
