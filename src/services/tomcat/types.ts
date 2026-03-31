/**
 * Tipos compartilhados para serviços Tomcat
 */

/** Configuração de proxy */
export interface TomcatProxyConfig {
    http?: string;
    https?: string;
    noProxy?: string[];
}

/** Informações de mirror */
export interface TomcatMirror {
    name: string;
    url: string;
    region: string;
    priority: number;
}

/** Configuração de download */
export interface TomcatDownloadConfig {
    /** Versão do Tomcat */
    version: string;
    /** Mirror preferido (ou 'auto' para seleção automática) */
    mirror?: string | "auto";
    /** Timeout em segundos */
    timeout?: number;
    /** Número de retries */
    retries?: number;
    /** Habilitar resume */
    resume?: boolean;
    /** Modo silencioso */
    silent?: boolean;
    /** Configuração de proxy */
    proxy?: TomcatProxyConfig;
    /** Cache de downloads */
    cache?: {
        enabled: boolean;
        dir: string;
    };
}

/** Resultado de instalação */
export interface TomcatInstallResult {
    success: boolean;
    version: string;
    home: string;
    downloaded: boolean;
    cached: boolean;
    resumed: boolean;
    attempts: number;
    duration: number;
    speed: number;
    size: number;
    checksum?: {
        expected: string;
        actual: string;
        valid: boolean;
    };
    error?: string;
}

/** Informações de versão instalada */
export interface InstalledVersion {
    version: string;
    home: string;
    size: number;
    installedAt: Date;
    lastUsed?: Date;
}

/** Resultado de backup */
export interface BackupResult {
    success: boolean;
    backupPath: string;
    size: number;
    timestamp: Date;
}

/** Resultado de restore */
export interface RestoreResult {
    success: boolean;
    fromVersion: string;
    toVersion: string;
    backupPath: string;
}

/** Compatibilidade de versão */
export interface CompatibilityResult {
    compatible: boolean;
    tomcatVersion: string;
    servletVersion: string;
    jspVersion: string;
    warnings: string[];
    errors: string[];
}

/** Estado do cache */
export interface CacheState {
    enabled: boolean;
    dir: string;
    size: number;
    files: CacheFile[];
}

/** Arquivo em cache */
export interface CacheFile {
    name: string;
    size: number;
    modified: Date;
    checksum: string;
}

/** Configuração de backup */
export interface BackupConfig {
    enabled: boolean;
    dir: string;
    maxBackups: number;
    autoBackup: boolean;
}
