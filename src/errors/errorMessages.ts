/**
 * Mensagens de erro contextuais com sugestões e auto-fix
 */

import { Logger } from "../logging";

export interface ErrorContext {
    message: string;
    suggestion: string;
    docsUrl?: string;
    autoFix?: () => Promise<boolean>;
    command?: string;
}

export const ErrorMessages: Record<string, ErrorContext> = {
    // Build errors
    MAVEN_NOT_FOUND: {
        message: "Maven não encontrado no PATH",
        suggestion: "Instale o Maven ou adicione ao PATH\n" +
                   "  • Windows: choco install maven\n" +
                   "  • macOS: brew install maven\n" +
                   "  • Linux: sudo apt install maven",
        docsUrl: "https://maven.apache.org/install.html",
        command: "xavva doctor --fix",
    },
    
    GRADLE_NOT_FOUND: {
        message: "Gradle não encontrado no PATH",
        suggestion: "Instale o Gradle ou adicione ao PATH\n" +
                   "  • Windows: choco install gradle\n" +
                   "  • macOS: brew install gradle\n" +
                   "  • Linux: sdk install gradle",
        docsUrl: "https://gradle.org/install/",
        command: "xavva doctor --fix",
    },
    
    BUILD_FAILED: {
        message: "Build falhou",
        suggestion: "Use --verbose para ver detalhes completos\n" +
                   "Verifique se todas as dependências estão disponíveis",
        command: "xavva build --verbose",
    },
    
    // Tomcat errors
    TOMCAT_NOT_FOUND: {
        message: "Tomcat não encontrado",
        suggestion: "Defina TOMCAT_HOME ou use Tomcat embutido\n" +
                   "Execute 'xavva dev --yes' para instalação automática",
        command: "xavva dev --yes",
    },
    
    TOMCAT_PORT_IN_USE: {
        message: "Porta {port} já está em uso",
        suggestion: "Escolha outra porta ou pare o processo atual",
        command: "xavva dev --port 8081",
    },
    
    // Java errors
    JAVA_NOT_FOUND: {
        message: "Java não encontrado no PATH",
        suggestion: "Instale JDK 11+ ou defina JAVA_HOME\n" +
                   "Execute 'xavva doctor --fix' para configuração automática",
        command: "xavva doctor --fix",
    },
    
    JAVA_VERSION_TOO_OLD: {
        message: "Versão do Java muito antiga ({version})",
        suggestion: "JDK 11+ é necessário\n" +
                   "Execute 'xavva doctor --fix' para instalar JDK moderno",
        command: "xavva doctor --fix",
    },
    
    // Config errors
    CONFIG_INVALID: {
        message: "Configuração inválida em xavva.json",
        suggestion: "Verifique sintaxe JSON e campos obrigatórios\n" +
                   "Execute 'xavva config' para ver configuração atual",
        command: "xavva config",
    },
    
    // Network errors
    DOWNLOAD_FAILED: {
        message: "Falha no download",
        suggestion: "Verifique conexão de internet\n" +
                   "Tente novamente em alguns instantes",
    },
    
    TIMEOUT: {
        message: "Tempo de espera esgotado",
        suggestion: "Operação demorou muito tempo\n" +
                   "Verifique conexão ou tente aumentar o timeout",
    },
    
    // File system errors
    PERMISSION_DENIED: {
        message: "Permissão negada",
        suggestion: "Execute com permissões adequadas\n" +
                   "Windows: Execute como Administrador\n" +
                   "Linux/macOS: Use sudo se necessário",
    },
    
    DISK_FULL: {
        message: "Disco cheio",
        suggestion: "Libere espaço em disco\n" +
                   "Execute 'xavva clean' para limpar arquivos temporários",
        command: "xavva clean",
    },
    
    // Port errors
    PORT_UNAVAILABLE: {
        message: "Porta não disponível",
        suggestion: "Porta pode estar em uso ou bloqueada pelo firewall\n" +
                   "Use outra porta: xavva dev --port 8081",
        command: "xavva dev --port 8081",
    },
    
    // Watch errors
    WATCH_TOO_MANY_FILES: {
        message: "Muitos arquivos para monitorar",
        suggestion: "Exclua node_modules do watch\n" +
                   "Adicione ao .gitignore ou use --exclude",
    },
};

/**
 * Obtém mensagem de erro contextual
 */
export function getErrorMessage(code: string, params: Record<string, string> = {}): ErrorContext {
    const template = ErrorMessages[code] || {
        message: `Erro desconhecido: ${code}`,
        suggestion: "Consulte a documentação ou reporte o problema",
    };
    
    // Substitui parâmetros
    let message = template.message;
    for (const [key, value] of Object.entries(params)) {
        message = message.replace(`{${key}}`, value);
    }
    
    return {
        ...template,
        message,
    };
}

/**
 * Mostra erro com contexto
 */
export function showContextualError(code: string, params: Record<string, string> = {}): void {
    const logger = Logger.getInstance();
    const error = getErrorMessage(code, params);
    
    logger.error(error.message);
    
    if (error.suggestion) {
        logger.newline();
        logger.info("💡 Dica:");
        for (const line of error.suggestion.split('\n')) {
            logger.info(`   ${line}`);
        }
    }
    
    if (error.command) {
        logger.newline();
        logger.info(`🔧 Tente: ${error.command}`);
    }
    
    if (error.docsUrl) {
        logger.newline();
        logger.url("📖 Documentação", error.docsUrl);
    }
}

/**
 * Tenta executar auto-fix para um erro
 */
export async function tryAutoFix(code: string): Promise<boolean> {
    const error = ErrorMessages[code];
    
    if (!error?.autoFix) {
        return false;
    }
    
    const logger = Logger.getInstance();
    logger.info(`🔧 Tentando correção automática...`);
    
    try {
        return await error.autoFix();
    } catch (e) {
        logger.error(`Auto-fix falhou: ${(e as Error).message}`);
        return false;
    }
}

/**
 * Detecta código de erro baseado na mensagem
 */
export function detectErrorCode(message: string): string | null {
    const patterns: Record<string, RegExp[]> = {
        MAVEN_NOT_FOUND: [/mvn[\s\w]*not found/i, /maven.*not.*found/i, /cannot find.*mvn/i],
        GRADLE_NOT_FOUND: [/gradle[\s\w]*not found/i, /cannot find.*gradle/i],
        JAVA_NOT_FOUND: [/java[\s\w]*not found/i, /cannot find.*java/i, /no java/i],
        BUILD_FAILED: [/build failed/i, /compilation failed/i, /failed to compile/i],
        TOMCAT_PORT_IN_USE: [/port.*in use/i, /address already in use/i, /bind.*failed/i],
        PERMISSION_DENIED: [/permission denied/i, /access denied/i, /eacces/i],
        DISK_FULL: [/disk full/i, /no space left/i, /enospc/i],
        TIMEOUT: [/timeout/i, /timed out/i, /etimedout/i],
    };
    
    for (const [code, regexes] of Object.entries(patterns)) {
        for (const regex of regexes) {
            if (regex.test(message)) {
                return code;
            }
        }
    }
    
    return null;
}

/**
 * Mostra erro genérico com detecção automática
 */
export function showSmartError(error: Error | string): void {
    const message = error instanceof Error ? error.message : error;
    const code = detectErrorCode(message);
    
    if (code) {
        showContextualError(code);
    } else {
        const logger = Logger.getInstance();
        logger.error(message);
        logger.info("Use --verbose para mais detalhes ou consulte a documentação");
    }
}
