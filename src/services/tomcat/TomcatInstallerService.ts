/**
 * Serviço integrado de instalação do Tomcat
 * 
 * Combina todos os serviços especializados:
 * - Download com retry, resume e progresso
 * - Seleção automática de mirrors
 * - Verificação de checksum SHA512
 * - Cache de downloads
 * - Backup e rollback
 * - Validação de compatibilidade
 * - Instalação paralela
 */
import { Logger } from "../../logging";
import { existsSync, promises as fsPromises } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

import { TomcatDownloadService } from "./TomcatDownloadService";
import { TomcatMirrorManager } from "./TomcatMirrorManager";
import { TomcatChecksumVerifier } from "./TomcatChecksumVerifier";
import { TomcatDownloadCache } from "./TomcatDownloadCache";
import { TomcatBackupManager } from "./TomcatBackupManager";
import { TomcatCompatibilityChecker } from "./TomcatCompatibilityChecker";

import type { 
    TomcatDownloadConfig, 
    TomcatInstallResult,
    TomcatProxyConfig,
    InstalledVersion,
    BackupResult
} from "./types";

import { getTomcatArchiveName, getExtractCommand } from "../../utils/platform";

export interface InstallOptions {
    version: string;
    /** Mirror específico ou 'auto' */
    mirror?: string;
    /** Verificar checksum */
    verifyChecksum?: boolean;
    /** Usar cache */
    useCache?: boolean;
    /** Criar backup se já instalado */
    backup?: boolean;
    /** Modo silencioso */
    silent?: boolean;
    /** Timeout em segundos */
    timeout?: number;
    /** Retries */
    retries?: number;
    /** Proxy */
    proxy?: TomcatProxyConfig;
    /** Diretório de instalação (padrão: ~/.xavva/tomcat) */
    installDir?: string;
    /** Verificar compatibilidade com projeto */
    projectPath?: string;
    /** Forçar reinstalação */
    force?: boolean;
}

export class TomcatInstallerService {
    private logger = Logger.getInstance();
    private downloadService: TomcatDownloadService;
    private mirrorManager: TomcatMirrorManager;
    private checksumVerifier: TomcatChecksumVerifier;
    private downloadCache: TomcatDownloadCache;
    private backupManager: TomcatBackupManager;
    private compatibilityChecker: TomcatCompatibilityChecker;

    constructor() {
        this.downloadService = new TomcatDownloadService();
        this.mirrorManager = new TomcatMirrorManager();
        this.checksumVerifier = new TomcatChecksumVerifier();
        this.downloadCache = new TomcatDownloadCache();
        this.backupManager = new TomcatBackupManager();
        this.compatibilityChecker = new TomcatCompatibilityChecker();
    }

    /**
     * Instala uma versão do Tomcat com todas as features
     */
    async install(options: InstallOptions): Promise<TomcatInstallResult> {
        const startTime = Date.now();
        const {
            version,
            mirror = "auto",
            verifyChecksum = true,
            useCache = true,
            backup = true,
            silent = false,
            timeout = 300,
            retries = 3,
            proxy,
            installDir = path.join(os.homedir(), ".xavva", "tomcat"),
            projectPath,
            force = false
        } = options;

        const result: TomcatInstallResult = {
            success: false,
            version,
            home: path.join(installDir, version),
            downloaded: false,
            cached: false,
            resumed: false,
            attempts: 0,
            duration: 0,
            speed: 0,
            size: 0
        };

        if (!silent) {
            this.logger.section(`Instalando Tomcat ${version}`);
        }

        // Verifica compatibilidade
        if (projectPath) {
            const compat = await this.compatibilityChecker.checkCompatibility(version, projectPath);
            this.compatibilityChecker.printCompatibilityReport(compat);
            
            if (!compat.compatible && !force) {
                result.error = "Incompatibilidade detectada. Use --force para ignorar.";
                return result;
            }
        }

        // Verifica se já está instalado
        if (existsSync(result.home)) {
            if (!force) {
                if (!silent) {
                    this.logger.info(`Tomcat ${version} já está instalado em ${result.home}`);
                }
                result.success = true;
                return result;
            }

            // Cria backup antes de sobrescrever
            if (backup) {
                if (!silent) {
                    this.logger.info("Criando backup da versão atual...");
                }
                await this.backupManager.backup(version);
            }

            // Remove instalação atual
            await fsPromises.rm(result.home, { recursive: true, force: true });
        }

        // Seleciona mirror
        let selectedMirror = mirror === "auto" 
            ? await this.mirrorManager.selectBestMirror()
            : this.mirrorManager.getMirrorByName(mirror) || await this.mirrorManager.selectBestMirror();

        if (!selectedMirror) {
            result.error = "Nenhum mirror disponível";
            return result;
        }

        if (!silent) {
            this.logger.info(`Mirror: ${selectedMirror.name} (${selectedMirror.region})`);
        }

        // Prepara URLs
        const archiveName = getTomcatArchiveName(version);
        const downloadUrl = this.mirrorManager.buildDownloadUrl(selectedMirror, version, archiveName);
        const checksumUrl = this.mirrorManager.buildChecksumUrl(selectedMirror, version, archiveName);

        // Verifica cache
        const cachePath = this.downloadCache.getCachePath(downloadUrl);
        let downloadPath: string;

        if (useCache && this.downloadCache.has(downloadUrl)) {
            if (!silent) {
                this.logger.success("Usando arquivo em cache");
            }
            result.cached = true;
            downloadPath = cachePath;
            const stats = await fsPromises.stat(downloadPath);
            result.size = stats.size;
        } else {
            // Download
            downloadPath = path.join(installDir, archiveName);
            
            // Garante diretório existe
            await fsPromises.mkdir(installDir, { recursive: true });

            if (!silent) {
                this.logger.info(`Baixando ${archiveName}...`);
            }

            const downloadResult = await this.downloadService.download({
                url: downloadUrl,
                destPath: downloadPath,
                retries,
                timeout: timeout * 1000,
                proxy,
                resume: true,
                silent,
                title: `Tomcat ${version}`
            });

            if (!downloadResult.success) {
                result.error = downloadResult.error;
                return result;
            }

            result.downloaded = true;
            result.resumed = downloadResult.resumed;
            result.attempts = downloadResult.attempts;
            result.size = downloadResult.size;
            result.speed = downloadResult.speed;

            // Verifica checksum
            if (verifyChecksum) {
                if (!silent) {
                    this.logger.info("Verificando integridade...");
                }
                
                const checksumResult = await this.checksumVerifier.verifyFromUrl(downloadPath, checksumUrl);
                result.checksum = {
                    expected: checksumResult.expected,
                    actual: checksumResult.actual,
                    valid: checksumResult.valid
                };

                if (!checksumResult.valid && !force) {
                    result.error = "Checksum inválido - arquivo pode estar corrompido";
                    await fsPromises.unlink(downloadPath).catch(() => {});
                    return result;
                }
            }

            // Adiciona ao cache
            if (useCache) {
                await this.downloadCache.set(downloadUrl, downloadPath);
            }
        }

        // Extração
        if (!silent) {
            this.logger.info("Extraindo arquivos...");
        }

        try {
            await this.extractArchive(downloadPath, installDir, silent);

            // Renomeia diretório extraído
            const extractedDir = path.join(installDir, `apache-tomcat-${version}`);
            if (existsSync(extractedDir) && extractedDir !== result.home) {
                await fsPromises.rename(extractedDir, result.home);
            }

            // Limpa arquivo de download (se não veio do cache)
            if (!result.cached && existsSync(downloadPath)) {
                await fsPromises.unlink(downloadPath).catch(() => {});
            }

            result.duration = (Date.now() - startTime) / 1000;
            result.success = true;

            if (!silent) {
                this.logger.success(`Tomcat ${version} instalado com sucesso!`);
                this.logger.info(`Local: ${result.home}`);
                this.logger.info(`Tamanho: ${this.formatBytes(result.size)}`);
                if (result.speed > 0) {
                    this.logger.info(`Velocidade: ${result.speed.toFixed(1)} MB/s`);
                }
            }

            return result;

        } catch (error) {
            // Rollback em caso de falha
            if (backup) {
                const hasBackup = await this.backupManager.hasBackup(version);
                if (hasBackup) {
                    if (!silent) {
                        this.logger.warn("Falha na extração. Restaurando backup...");
                    }
                    await this.backupManager.restore(version);
                }
            }

            result.error = `Falha na extração: ${error}`;
            return result;
        }
    }

    /**
     * Instala múltiplas versões em paralelo
     */
    async installParallel(versions: string[], options: Omit<InstallOptions, "version">): Promise<TomcatInstallResult[]> {
        this.logger.section("Instalação Paralela");
        this.logger.info(`Instalando ${versions.length} versões...`);

        const promises = versions.map(version => 
            this.install({ ...options, version })
        );

        const results = await Promise.all(promises);
        
        const success = results.filter(r => r.success).length;
        const failed = results.length - success;

        this.logger.success(`Concluído: ${success} sucesso, ${failed} falha(s)`);

        return results;
    }

    /**
     * Desinstala uma versão
     */
    async uninstall(version: string, installDir?: string): Promise<boolean> {
        const home = path.join(installDir || path.join(os.homedir(), ".xavva", "tomcat"), version);

        if (!existsSync(home)) {
            this.logger.warn(`Tomcat ${version} não está instalado`);
            return false;
        }

        // Cria backup antes de desinstalar
        await this.backupManager.backup(version);

        await fsPromises.rm(home, { recursive: true, force: true });
        this.logger.success(`Tomcat ${version} desinstalado`);

        return true;
    }

    /**
     * Lista versões instaladas
     */
    async listInstalled(installDir?: string): Promise<InstalledVersion[]> {
        const baseDir = installDir || path.join(os.homedir(), ".xavva", "tomcat");
        
        if (!existsSync(baseDir)) {
            return [];
        }

        const versions: InstalledVersion[] = [];
        const entries = await fsPromises.readdir(baseDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const home = path.join(baseDir, entry.name);
            const catalinaScript = path.join(home, "bin", os.platform() === "win32" ? "catalina.bat" : "catalina.sh");

            if (existsSync(catalinaScript)) {
                const stats = await fsPromises.stat(home);
                versions.push({
                    version: entry.name,
                    home,
                    size: await this.calculateDirSize(home),
                    installedAt: stats.birthtime,
                    lastUsed: stats.mtime
                });
            }
        }

        return versions.sort((a, b) => a.version.localeCompare(b.version));
    }

    /**
     * Verifica se versão está instalada
     */
    isInstalled(version: string, installDir?: string): boolean {
        const home = path.join(installDir || path.join(os.homedir(), ".xavva", "tomcat"), version);
        const catalinaScript = path.join(home, "bin", os.platform() === "win32" ? "catalina.bat" : "catalina.sh");
        return existsSync(catalinaScript);
    }

    /**
     * Retorna estatísticas do cache
     */
    async getCacheStats(): Promise<{ size: number; files: number }> {
        const state = await this.downloadCache.getState();
        return {
            size: state.size,
            files: state.files.length
        };
    }

    /**
     * Limpa cache de downloads
     */
    async clearCache(): Promise<void> {
        await this.downloadCache.clear();
    }

    /**
     * Retorna backups disponíveis
     */
    async listBackups(version?: string): Promise<Array<{
        version: string;
        path: string;
        size: number;
        timestamp: Date;
    }>> {
        return this.backupManager.listBackups(version);
    }

    /**
     * Restaura backup
     */
    async restoreBackup(version: string, backupPath?: string): Promise<boolean> {
        const result = await this.backupManager.restore(version, backupPath);
        return result.success;
    }

    /**
     * Extrai arquivo
     */
    private async extractArchive(archivePath: string, destDir: string, silent: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            const cmd = getExtractCommand(archivePath, destDir);
            
            if (!cmd) {
                reject(new Error(`Formato não suportado: ${path.extname(archivePath)}`));
                return;
            }

            const extractProcess = spawn(cmd[0], cmd.slice(1), {
                stdio: silent ? "ignore" : "inherit"
            });

            extractProcess.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Código ${code}`));
                }
            });

            extractProcess.on("error", (err) => {
                reject(err);
            });
        });
    }

    /**
     * Calcula tamanho de diretório
     */
    private async calculateDirSize(dir: string): Promise<number> {
        let size = 0;
        
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                size += await this.calculateDirSize(entryPath);
            } else {
                const stats = await fsPromises.stat(entryPath);
                size += stats.size;
            }
        }
        
        return size;
    }

    /**
     * Formata bytes
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }
}
