/**
 * Parser de argumentos CLI com tipagem forte
 * Wrapper tipado ao redor de parseArgs do Bun
 */

import { parseArgs } from "util";
import type { 
    BaseArgs, 
    DeployArgs, 
    BuildArgs, 
    StartArgs, 
    RunArgs,
    LogsArgs,
    AuditArgs,
    DepsArgs,
    DocsArgs,
    ProfilesArgs,
    DoctorArgs,
    TomcatCommandArgs,
    EncodingCommandArgs,
    ConfigArgs,
    HistoryArgs,
    CompletionArgs,
    CleanArgs,
    TestArgs,
    DbArgs,
    HttpArgs,
    DockerArgs,
    ChangelogArgs,
    IdeArgs,
    CLIArguments 
} from "../types/args";

// Map de opções para parseArgs
const PARSE_OPTIONS = {
    // Base
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
    verbose: { type: "boolean", short: "V" },
    quiet: { type: "boolean", short: "q" },
    "debug-level": { type: "string" },

    // Project
    tool: { type: "string", short: "t" },
    name: { type: "string", short: "n" },
    profile: { type: "string", short: "P" },
    encoding: { type: "string", short: "e" },
    "no-build": { type: "boolean", short: "s" },
    clean: { type: "boolean", short: "c" },
    war: { type: "boolean", short: "W" },
    cache: { type: "boolean" },

    // Tomcat
    path: { type: "string", short: "p" },
    port: { type: "string" },
    "tomcat-version": { type: "string" },
    yes: { type: "boolean", short: "y" },

    // Debug/Dev
    debug: { type: "boolean", short: "d" },
    watch: { type: "boolean", short: "w" },
    tui: { type: "boolean" },
    dp: { type: "string" },
    incremental: { type: "boolean" },

    // Analysis
    grep: { type: "string", short: "G" },
    scan: { type: "boolean" },
    fix: { type: "boolean" },
    output: { type: "string", short: "o" },
    strict: { type: "boolean" },
    "update-safe": { type: "boolean" },

    // Encoding
    from: { type: "string" },
    to: { type: "string" },
    backup: { type: "boolean" },
    "dry-run": { type: "boolean" },
    force: { type: "boolean" },
    src: { type: "string" },

    // Config/History
    interactive: { type: "boolean", short: "i" },
    clear: { type: "boolean" },
    limit: { type: "string" },

    // Completion
    shell: { type: "string" },

    // Clean
    all: { type: "boolean" },
    logs: { type: "boolean" },
    build: { type: "boolean" },

    // Test
    coverage: { type: "boolean" },
    "fail-fast": { type: "boolean" },
    parallel: { type: "boolean" },

    // HTTP
    "base-url": { type: "string" },
    body: { type: "string" },
    file: { type: "string" },
    header: { type: "string", multiple: true },
    "content-type": { type: "string" },
    accept: { type: "string" },
    param: { type: "string", multiple: true },
    timeout: { type: "string" },

    // Docker
    tag: { type: "string" },
    "java-version": { type: "string" },
    detached: { type: "boolean", short: "d" },
    registry: { type: "string" },
    namespace: { type: "string" },

    // Multi-environment
    env: { type: "string" },
    environment: { type: "string" },

    // Profile
    profile: { type: "boolean" },

    // IDE
    ide: { type: "string" },
} as const;

export interface ParsedArgs<T = CLIArguments> {
    values: T;
    positionals: string[];
}

/**
 * Parse argumentos genéricos
 */
export function parseCliArgs(argv: string[]): ParsedArgs {
    return parseArgs({
        args: argv,
        options: PARSE_OPTIONS,
        strict: false,
        allowPositionals: true,
    }) as ParsedArgs;
}

/**
 * Parse argumentos específicos para comando deploy
 */
export function parseDeployArgs(argv: string[]): ParsedArgs<DeployArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as DeployArgs };
}

/**
 * Parse argumentos específicos para comando build
 */
export function parseBuildArgs(argv: string[]): ParsedArgs<BuildArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as BuildArgs };
}

/**
 * Parse argumentos específicos para comando start
 */
export function parseStartArgs(argv: string[]): ParsedArgs<StartArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as StartArgs };
}

/**
 * Parse argumentos específicos para comando run/debug
 */
export function parseRunArgs(argv: string[]): ParsedArgs<RunArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as RunArgs };
}

/**
 * Parse argumentos específicos para comando logs
 */
export function parseLogsArgs(argv: string[]): ParsedArgs<LogsArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as LogsArgs };
}

/**
 * Parse argumentos específicos para comando audit
 */
export function parseAuditArgs(argv: string[]): ParsedArgs<AuditArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as AuditArgs };
}

/**
 * Parse argumentos específicos para comando deps
 */
export function parseDepsArgs(argv: string[]): ParsedArgs<DepsArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as DepsArgs };
}

/**
 * Parse argumentos específicos para comando doctor
 */
export function parseDoctorArgs(argv: string[]): ParsedArgs<DoctorArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as DoctorArgs };
}

/**
 * Parse argumentos específicos para comando clean
 */
export function parseCleanArgs(argv: string[]): ParsedArgs<CleanArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as CleanArgs };
}

/**
 * Parse argumentos específicos para comando encoding
 */
export function parseEncodingArgs(argv: string[]): ParsedArgs<EncodingCommandArgs> {
    const parsed = parseCliArgs(argv);
    return { ...parsed, values: parsed.values as EncodingCommandArgs };
}

/**
 * Obtém o comando principal dos positionals
 */
export function detectCommand(positionals: string[]): string {
    const commandNames = [
        "deploy", "build", "start", "dev", "doctor", "run", 
        "debug", "logs", "docs", "audit", "profiles", 
        "deps", "tomcat", "encoding", "init", "config", 
        "history", "redo", "health", "completion", "changelog",
        "test", "db", "http", "docker", "help", "clean", "ide"
    ];
    
    return positionals.find(p => commandNames.includes(p)) || "deploy";
}

/**
 * Factory para parser baseado no comando
 */
export function createCommandParser(command: string) {
    const parsers: Record<string, (argv: string[]) => ParsedArgs> = {
        deploy: parseDeployArgs,
        dev: parseDeployArgs,
        build: parseBuildArgs,
        start: parseStartArgs,
        run: parseRunArgs,
        debug: parseRunArgs,
        logs: parseLogsArgs,
        audit: parseAuditArgs,
        deps: parseDepsArgs,
        doctor: parseDoctorArgs,
        clean: parseCleanArgs,
        encoding: parseEncodingArgs,
    };
    
    return parsers[command] || parseCliArgs;
}
