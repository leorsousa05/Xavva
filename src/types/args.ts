/**
 * Argumentos de linha de comando tipados por contexto
 * Substitui CLIArguments monolítico
 */

// ===== Args Base (comuns a todos os comandos) =====
export interface BaseArgs {
    help?: boolean;
    version?: boolean;
    verbose?: boolean;
    quiet?: boolean;
}

// ===== Args de Configuração de Projeto =====
export interface ProjectArgs {
    tool?: string;
    name?: string;
    profile?: string;
    encoding?: string;
    "no-build"?: boolean;
    clean?: boolean;
    war?: boolean;
    cache?: boolean;
}

// ===== Args de Configuração do Tomcat =====
export interface TomcatArgs {
    path?: string;
    port?: string;
    "tomcat-version"?: string;
    yes?: boolean;
}

// ===== Args de Debug/Desenvolvimento =====
export interface DebugArgs {
    debug?: boolean;
    watch?: boolean;
    tui?: boolean;
    dp?: string;
}

// ===== Args de Análise =====
export interface AnalysisArgs {
    grep?: string;
    scan?: boolean;
    fix?: boolean;
    output?: string;
    strict?: boolean;
    "update-safe"?: boolean;
}

// ===== Args de Encoding =====
export interface EncodingArgs {
    from?: string;
    to?: string;
    backup?: boolean;
    "dry-run"?: boolean;
    force?: boolean;
    src?: string;
}

// ===== Args Específicas de Comandos =====
export interface DeployArgs extends BaseArgs, ProjectArgs, TomcatArgs, DebugArgs {
    incremental?: boolean;
    changedFiles?: string[];
}

export interface BuildArgs extends BaseArgs, ProjectArgs {
    // Herda de ProjectArgs
}

export interface StartArgs extends BaseArgs, TomcatArgs, DebugArgs {
    // Herda de TomcatArgs e DebugArgs
}

export interface RunArgs extends BaseArgs, DebugArgs {
    // Positional: className
}

export interface LogsArgs extends BaseArgs {
    grep?: string;
}

export interface AuditArgs extends BaseArgs, AnalysisArgs {
    // Herda de AnalysisArgs
}

export interface DepsArgs extends BaseArgs, AnalysisArgs {
    // Herda de AnalysisArgs
}

export interface DocsArgs extends BaseArgs {
    output?: string;
}

export interface ProfilesArgs extends BaseArgs {
    // Sem args específicas
}

export interface DoctorArgs extends BaseArgs {
    fix?: boolean;
}

export interface TomcatCommandArgs extends BaseArgs, TomcatArgs {
    "tomcat-action"?: string;
}

export interface EncodingCommandArgs extends BaseArgs, EncodingArgs {
    // Herda de EncodingArgs
}

// ===== CLIArguments Legado (para compatibilidade) =====
// Será gradualmente removido
export interface CLIArguments extends 
    BaseArgs, 
    ProjectArgs, 
    TomcatArgs, 
    DebugArgs, 
    AnalysisArgs, 
    EncodingArgs {
    // Campos adicionais para compatibilidade
    [key: string]: unknown;
}

// ===== Type Guards =====
export function isDeployArgs(args: CLIArguments): args is DeployArgs {
    return "incremental" in args || "watch" in args;
}

export function isBuildArgs(args: CLIArguments): args is BuildArgs {
    return "tool" in args || "clean" in args;
}

export function isEncodingArgs(args: CLIArguments): args is EncodingCommandArgs {
    return "from" in args || "to" in args;
}
