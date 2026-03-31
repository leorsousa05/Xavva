/**
 * Gerenciador de backup e rollback do Tomcat
 * 
 * Features:
 * - Backup automático antes de atualizações
 * - Restore para versão anterior
 * - Múltiplos backups
 * - Limpeza de backups antigos
 */
import { Logger } from "../../logging";
import { existsSync, promises as fsPromises } from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import type { BackupResult, RestoreResult, BackupConfig } from "./types";

// Configuração padrão
const DEFAULT_CONFIG: BackupConfig = {
    enabled: true,
    dir: path.join(os.homedir(), ".xavva", "backups"),
    maxBackups: 3,
    autoBackup: true
};

export class TomcatBackupManager {
    private logger = Logger.getInstance();
    private config: BackupConfig;
    private tomcatBaseDir: string;

    constructor(config?: Partial<BackupConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.tomcatBaseDir = path.join(os.homedir(), ".xavva", "tomcat");
        this.ensureBackupDir();
    }

    /**
     * Cria backup de uma versão instalada
     */
    async backup(version: string): Promise<BackupResult> {
        const sourceDir = path.join(this.tomcatBaseDir, version);
        
        if (!existsSync(sourceDir)) {
            throw new Error(`Versão ${version} não está instalada`);
        }

        if (!this.config.enabled) {
            this.logger.warn("Backups desabilitados");
            return {
                success: false,
                backupPath: "",
                size: 0,
                timestamp: new Date()
            };
        }

        const timestamp = new Date();
        const backupName = `tomcat-${version}-${this.formatTimestamp(timestamp)}`;
        const backupPath = path.join(this.config.dir, backupName);

        this.logger.info(`Criando backup de Tomcat ${version}...`);

        try {
            // Copia diretório
            await this.copyDir(sourceDir, backupPath);

            // Calcula tamanho
            const size = await this.calculateDirSize(backupPath);

            // Limpa backups antigos
            await this.cleanupOldBackups(version);

            this.logger.success(`Backup criado: ${backupName} (${this.formatBytes(size)})`);

            return {
                success: true,
                backupPath,
                size,
                timestamp
            };
        } catch (error) {
            this.logger.error(`Falha ao criar backup: ${error}`);
            
            // Limpa backup parcial
            if (existsSync(backupPath)) {
                await fsPromises.rm(backupPath, { recursive: true, force: true });
            }

            return {
                success: false,
                backupPath: "",
                size: 0,
                timestamp
            };
        }
    }

    /**
     * Restaura backup de uma versão
     */
    async restore(version: string, backupPath?: string): Promise<RestoreResult> {
        const targetDir = path.join(this.tomcatBaseDir, version);
        
        // Se não especificado, usa o backup mais recente
        if (!backupPath) {
            const backups = await this.listBackups(version);
            if (backups.length === 0) {
                throw new Error(`Nenhum backup encontrado para versão ${version}`);
            }
            backupPath = backups[0].path;
        }

        if (!existsSync(backupPath)) {
            throw new Error(`Backup não encontrado: ${backupPath}`);
        }

        this.logger.info(`Restaurando backup de Tomcat ${version}...`);

        // Guarda versão atual se existir
        const currentBackup = existsSync(targetDir) 
            ? await this.backup(version).catch(() => null)
            : null;

        try {
            // Remove instalação atual
            if (existsSync(targetDir)) {
                await fsPromises.rm(targetDir, { recursive: true, force: true });
            }

            // Copia backup
            await this.copyDir(backupPath, targetDir);

            this.logger.success(`Tomcat ${version} restaurado com sucesso!`);

            return {
                success: true,
                fromVersion: version,
                toVersion: version,
                backupPath
            };
        } catch (error) {
            this.logger.error(`Falha ao restaurar: ${error}`);

            // Tenta restaurar backup anterior
            if (currentBackup?.success) {
                this.logger.info("Tentando restaurar versão anterior...");
                await this.copyDir(currentBackup.backupPath, targetDir);
            }

            return {
                success: false,
                fromVersion: version,
                toVersion: version,
                backupPath
            };
        }
    }

    /**
     * Lista backups disponíveis
     */
    async listBackups(version?: string): Promise<Array<{
        version: string;
        path: string;
        size: number;
        timestamp: Date;
    }>> {
        if (!existsSync(this.config.dir)) {
            return [];
        }

        const entries = await fsPromises.readdir(this.config.dir, { withFileTypes: true });
        const backups = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const match = entry.name.match(/^tomcat-(\d+\.\d+\.\d+)-(\d{8}-\d{6})$/);
            if (!match) continue;

            const [, backupVersion, timestamp] = match;

            if (version && backupVersion !== version) continue;

            const backupPath = path.join(this.config.dir, entry.name);
            const size = await this.calculateDirSize(backupPath);

            backups.push({
                version: backupVersion,
                path: backupPath,
                size,
                timestamp: this.parseTimestamp(timestamp)
            });
        }

        // Ordena por data (mais recente primeiro)
        backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        return backups;
    }

    /**
     * Remove todos os backups de uma versão
     */
    async removeBackups(version: string): Promise<number> {
        const backups = await this.listBackups(version);
        let count = 0;

        for (const backup of backups) {
            await fsPromises.rm(backup.path, { recursive: true, force: true });
            count++;
        }

        return count;
    }

    /**
     * Limpa backups antigos mantendo apenas os mais recentes
     */
    async cleanupOldBackups(version: string): Promise<void> {
        const backups = await this.listBackups(version);
        
        if (backups.length <= this.config.maxBackups) {
            return;
        }

        // Remove backups excedentes
        const toRemove = backups.slice(this.config.maxBackups);
        
        for (const backup of toRemove) {
            this.logger.debug(`Removendo backup antigo: ${path.basename(backup.path)}`);
            await fsPromises.rm(backup.path, { recursive: true, force: true });
        }
    }

    /**
     * Verifica se existe backup para versão
     */
    async hasBackup(version: string): Promise<boolean> {
        const backups = await this.listBackups(version);
        return backups.length > 0;
    }

    /**
     * Copia diretório recursivamente
     */
    private async copyDir(source: string, target: string): Promise<void> {
        await fsPromises.mkdir(target, { recursive: true });
        
        const entries = await fsPromises.readdir(source, { withFileTypes: true });
        
        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const targetPath = path.join(target, entry.name);
            
            if (entry.isDirectory()) {
                await this.copyDir(sourcePath, targetPath);
            } else {
                await fsPromises.copyFile(sourcePath, targetPath);
            }
        }
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
     * Formata timestamp para nome de arquivo
     */
    private formatTimestamp(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hour = String(date.getHours()).padStart(2, "0");
        const min = String(date.getMinutes()).padStart(2, "0");
        const sec = String(date.getSeconds()).padStart(2, "0");
        return `${year}${month}${day}-${hour}${min}${sec}`;
    }

    /**
     * Parse de timestamp
     */
    private parseTimestamp(ts: string): Date {
        const year = parseInt(ts.substring(0, 4));
        const month = parseInt(ts.substring(4, 6)) - 1;
        const day = parseInt(ts.substring(6, 8));
        const hour = parseInt(ts.substring(9, 11));
        const min = parseInt(ts.substring(11, 13));
        const sec = parseInt(ts.substring(13, 15));
        return new Date(year, month, day, hour, min, sec);
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

    /**
     * Garante que diretório existe
     */
    private ensureBackupDir(): void {
        if (!existsSync(this.config.dir)) {
            fsPromises.mkdir(this.config.dir, { recursive: true });
        }
    }
}
