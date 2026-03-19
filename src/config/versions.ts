/**
 * Configurações centralizadas de versões
 * Evita hardcoding espalhado pelo código
 */

export const VERSIONS = {
    // Versões padrão do Tomcat
    TOMCAT: {
        DEFAULT: "10.1.52",
        AVAILABLE: {
            "10.1.52": { sha512: "" },
            "9.0.115": { sha512: "" },
            "11.0.18": { sha512: "" },
        },
    },

    // HotswapAgent
    HOTSWAP_AGENT: {
        VERSION: "2.0.3",
        URL: "https://github.com/HotswapProjects/HotswapAgent/releases/download/RELEASE-{version}/hotswap-agent-{version}.jar",
    },

    // Configurações padrão
    DEFAULTS: {
        TOMCAT_PORT: 8080,
        DEBUG_PORT: 5005,
        DEBOUNCE_MS: 300,
        COOLING_MS: 1000,
    },
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
