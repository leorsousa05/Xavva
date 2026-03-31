/**
 * Serviços de instalação e gerenciamento do Tomcat
 * 
 * Módulos:
 * - TomcatDownloadService: Download com retry, resume e progresso
 * - TomcatMirrorManager: Seleção automática de mirrors
 * - TomcatChecksumVerifier: Validação SHA512
 * - TomcatDownloadCache: Cache persistente
 * - TomcatBackupManager: Backup e rollback
 * - TomcatCompatibilityChecker: Validação de compatibilidade
 * - TomcatInstallerService: Integração de todos os serviços
 */

export { TomcatDownloadService } from "./TomcatDownloadService";
export type { DownloadOptions, DownloadResult } from "./TomcatDownloadService";
export { TomcatMirrorManager } from "./TomcatMirrorManager";
export { TomcatChecksumVerifier } from "./TomcatChecksumVerifier";
export type { ChecksumResult } from "./TomcatChecksumVerifier";
export { TomcatDownloadCache } from "./TomcatDownloadCache";
export { TomcatBackupManager } from "./TomcatBackupManager";
export { TomcatCompatibilityChecker } from "./TomcatCompatibilityChecker";
export { TomcatInstallerService } from "./TomcatInstallerService";

export type {
    TomcatProxyConfig,
    TomcatMirror,
    TomcatDownloadConfig,
    TomcatInstallResult,
    InstalledVersion,
    BackupResult,
    RestoreResult,
    CompatibilityResult,
    CacheState,
    CacheFile,
    BackupConfig
} from "./types";
