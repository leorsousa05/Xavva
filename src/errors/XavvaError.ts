/**
 * Hierarquia de erros específicos do Xavva
 * Permite tratamento granular de diferentes tipos de falhas
 */

export class XavvaError extends Error {
    public readonly code: string;
    public readonly exitCode: number;
    public readonly isOperational: boolean;

    constructor(
        message: string,
        code: string = "XAVVA_ERROR",
        exitCode: number = 1,
        isOperational: boolean = true
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.isOperational = isOperational;

        // Mantém o stack trace correto
        Error.captureStackTrace(this, this.constructor);
    }
}

// ===== Erros de Build =====
export class BuildError extends XavvaError {
    constructor(message: string, details?: string) {
        super(
            details ? `${message}: ${details}` : message,
            "BUILD_ERROR",
            3,
            true
        );
    }
}

export class MavenError extends BuildError {
    constructor(message: string, exitCode?: number) {
        super(
            `Maven build failed${exitCode ? ` (exit ${exitCode})` : ""}: ${message}`,
        );
        this.code = "MAVEN_ERROR";
    }
}

export class GradleError extends BuildError {
    constructor(message: string, exitCode?: number) {
        super(
            `Gradle build failed${exitCode ? ` (exit ${exitCode})` : ""}: ${message}`,
        );
        this.code = "GRADLE_ERROR";
    }
}

// ===== Erros de Deploy =====
export class DeployError extends XavvaError {
    constructor(message: string, details?: string) {
        super(
            details ? `${message}: ${details}` : message,
            "DEPLOY_ERROR",
            4,
            true
        );
    }
}

export class ArtifactNotFoundError extends DeployError {
    constructor(buildDir: string) {
        super(
            `Nenhum artefato (.war ou pasta exploded) encontrado em ${buildDir}`,
            "Certifique-se de que o build foi executado com sucesso"
        );
        this.code = "ARTIFACT_NOT_FOUND";
    }
}

// ===== Erros de Tomcat =====
export class TomcatError extends XavvaError {
    constructor(message: string, details?: string) {
        super(
            details ? `${message}: ${details}` : message,
            "TOMCAT_ERROR",
            5,
            true
        );
    }
}

export class TomcatNotFoundError extends TomcatError {
    constructor(path: string) {
        super(
            `Tomcat não encontrado em ${path}`,
            "Defina TOMCAT_HOME, CATALINA_HOME ou use --path"
        );
        this.code = "TOMCAT_NOT_FOUND";
    }
}

export class PortInUseError extends TomcatError {
    constructor(port: number) {
        super(
            `Porta ${port} já está em uso`,
            "Pare o processo que está usando a porta ou especifique outra com --port"
        );
        this.code = "PORT_IN_USE";
    }
}

export class EmbeddedTomcatError extends TomcatError {
    constructor(message: string) {
        super(
            `Falha no Tomcat embutido: ${message}`,
            "Tente instalar manualmente ou use outra versão com --tomcat-version"
        );
        this.code = "EMBEDDED_TOMCAT_ERROR";
    }
}

// ===== Erros de Configuração =====
export class ConfigError extends XavvaError {
    constructor(message: string, details?: string) {
        super(
            details ? `${message}: ${details}` : message,
            "CONFIG_ERROR",
            2,
            true
        );
    }
}

export class InvalidConfigError extends ConfigError {
    constructor(field: string, value: string, expected?: string) {
        super(
            `Configuração inválida: ${field} = '${value}'`,
            expected || "Verifique sua configuração"
        );
        this.code = "INVALID_CONFIG";
    }
}

export class MissingConfigError extends ConfigError {
    constructor(field: string) {
        super(
            `Configuração obrigatória ausente: ${field}`,
            `Defina ${field} no xavva.json ou via linha de comando`
        );
        this.code = "MISSING_CONFIG";
    }
}

// ===== Erros de Projeto =====
export class ProjectError extends XavvaError {
    constructor(message: string, details?: string) {
        super(
            details ? `${message}: ${details}` : message,
            "PROJECT_ERROR",
            6,
            true
        );
    }
}

export class BuildToolNotFoundError extends ProjectError {
    constructor() {
        super(
            "Não foi possível detectar a ferramenta de build",
            "Certifique-se de estar no diretório raiz do projeto (pom.xml ou build.gradle)"
        );
        this.code = "BUILD_TOOL_NOT_FOUND";
    }
}

export class JavaNotFoundError extends ProjectError {
    constructor() {
        super(
            "Java não encontrado",
            "Defina JAVA_HOME ou certifique-se de que 'java' está no PATH"
        );
        this.code = "JAVA_NOT_FOUND";
    }
}

// ===== Erros de Audit/Security =====
export class AuditError extends XavvaError {
    constructor(message: string) {
        super(
            `Erro na auditoria: ${message}`,
            "AUDIT_ERROR",
            7,
            true
        );
    }
}

export class NetworkError extends XavvaError {
    public readonly url: string;
    public readonly originalError?: Error;
    
    constructor(url: string, originalError?: Error) {
        super(
            `Falha na conexão com ${url}${originalError ? `: ${originalError.message}` : ""}`,
            "NETWORK_ERROR",
            8,
            true
        );
        this.url = url;
        this.originalError = originalError;
    }
}

// ===== Erros de File System =====
export class FileSystemError extends XavvaError {
    constructor(message: string, path?: string) {
        super(
            path ? `${message}: ${path}` : message,
            "FILESYSTEM_ERROR",
            9,
            true
        );
    }
}

export class FileNotFoundError extends FileSystemError {
    constructor(path: string) {
        super("Arquivo não encontrado", path);
        this.code = "FILE_NOT_FOUND";
    }
}

export class PermissionError extends FileSystemError {
    constructor(path: string) {
        super("Permissão negada", path);
        this.code = "PERMISSION_DENIED";
    }
}

// ===== Erros de Comando =====
export class CommandError extends XavvaError {
    constructor(command: string, message: string) {
        super(
            `Erro no comando '${command}': ${message}`,
            "COMMAND_ERROR",
            10,
            true
        );
    }
}

export class UnknownCommandError extends CommandError {
    constructor(command: string) {
        super(command, "Comando desconhecido");
        this.code = "UNKNOWN_COMMAND";
    }
}

// Helper para identificar se é erro operacional (vs programação)
export function isOperationalError(error: Error): boolean {
    if (error instanceof XavvaError) {
        return error.isOperational;
    }
    return false;
}

// Helper para obter exit code de qualquer erro
export function getExitCode(error: Error): number {
    if (error instanceof XavvaError) {
        return error.exitCode;
    }
    return 1; // Erro genérico
}
