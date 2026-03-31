/**
 * Configurações centralizadas de versões e constantes
 * Fonte única da verdade para todo o XAVVA CLI
 */

// ============================================
// VERSÕES
// ============================================

export const VERSIONS = {
    // Versões padrão do Tomcat
    TOMCAT: {
        DEFAULT: "10.1.52",
        AVAILABLE: {
            "10.1.52": { sha512: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
            "9.0.115": { sha512: "" },
            "11.0.18": { sha512: "" },
        },
    },

    // HotswapAgent
    HOTSWAP_AGENT: {
        VERSION: "2.0.3",
        URL: "https://github.com/HotswapProjects/HotswapAgent/releases/download/RELEASE-{version}/hotswap-agent-{version}.jar",
    },

    // Requisitos
    JDK: {
        MIN: "11",
        RECOMMENDED: "17",
    },
} as const;

// ============================================
// PORTAS PADRÃO
// ============================================

export const PORTS = {
    DEFAULT_TOMCAT: 8080,
    DEFAULT_DEBUG: 5005,
} as const;

// ============================================
// TIMEOUTS (ms)
// ============================================

export const TIMEOUTS = {
    SHUTDOWN: 5000,
    DEBOUNCE: 300,
    COOLING: 1000,
    WATCHER_DEBOUNCE: 1500,
    BROWSER_OPEN: 800,
    DEPLOY_HEALTH_CHECK: 1500,
    HOTSWAP: 500,
    TOMCAT_CLEAN_RETRY: 50,
} as const;

// ============================================
// LIMITES E TAMANHOS
// ============================================

export const LIMITS = {
    MAX_LOG_SCROLLBUFFER: 1000,
    MAX_BUILD_ERRORS_SHOWN: 15,
    MAX_HISTORY_ITEMS: 10,
    MAX_DUPLICATE_LOGS: 5,
    RATE_LIMIT_WINDOW_MS: 5000,
    JAR_INTEGRITY_BUFFER_SIZE: 1024,
    JAR_MIN_VALID_SIZE: 1000,
    ZIP_EOCD_SIGNATURE_SIZE: 4,
} as const;

// ============================================
// DASHBOARD
// ============================================

export const DASHBOARD = {
    REFRESH_INTERVAL_MS: 1000,
    LOG_SLICE_LINES: 1000,
} as const;

// ============================================
// BUILD
// ============================================

export const BUILD = {
    MAVEN_PARALLEL_THREADS: "1C",
    JVM_MEMORY_OPTS: "-Xms512m -Xmx1024m -XX:+UseParallelGC",
    GRADLE_MEMORY_OPTS: "-Xmx1024m -Dorg.gradle.daemon=true",
} as const;

// ============================================
// EXIT CODES
// ============================================

export const EXIT_CODES = {
    SUCCESS: 0,
    GENERIC_ERROR: 1,
    INVALID_COMMAND: 2,
    BUILD_FAILED: 3,
    DEPLOY_FAILED: 4,
    TOMCAT_ERROR: 5,
    PROJECT_ERROR: 6,
    AUDIT_ERROR: 7,
    NETWORK_ERROR: 8,
    FILESYSTEM_ERROR: 9,
    COMMAND_ERROR: 10,
    SIGINT: 130,
} as const;

// ============================================
// ARQUIVOS E DIRETÓRIOS
// ============================================

export const PATHS = {
    JAVA_FILE_PATTERN: "**/*.java",
    WAR_EXTENSION: ".war",
    JAR_EXTENSION: ".jar",
    XAVVA_DIR: ".xavva",
    TARGET_DIR: "target",
    BUILD_DIR: "build",
    WEBAPP_DIR: "webapps",
} as const;

// ============================================
// CACHE
// ============================================

export const CACHE = {
    MAX_AGE_MS: 24 * 60 * 60 * 1000,
    VERSION: 1,
} as const;

// Type helpers
export type TomcatVersion = keyof typeof VERSIONS.TOMCAT.AVAILABLE;

/**
 * Obtém URL de download do HotswapAgent
 */
export function getHotswapAgentUrl(version: string = VERSIONS.HOTSWAP_AGENT.VERSION): string {
    return VERSIONS.HOTSWAP_AGENT.URL
        .replace(/{version}/g, version);
}

/**
 * Verifica se versão do Tomcat é suportada
 */
export function isSupportedTomcatVersion(version: string): version is TomcatVersion {
    return version in VERSIONS.TOMCAT.AVAILABLE;
}

/**
 * Obtém versões disponíveis do Tomcat
 */
export function getAvailableTomcatVersions(): string[] {
    return Object.keys(VERSIONS.TOMCAT.AVAILABLE);
}

/**
 * Obtém SHA512 de uma versão do Tomcat
 */
export function getTomcatSha512(version: string): string | undefined {
    const info = VERSIONS.TOMCAT.AVAILABLE[version as TomcatVersion];
    return info?.sha512;
}
