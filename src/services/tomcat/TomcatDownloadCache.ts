/**
 * Sistema de cache de downloads Tomcat
 * 
 * Features:
 * - Cache persistente entre projetos
 * - Identificação por checksum
 * - Limpeza automática de arquivos antigos
 * - Limite de tamanho do cache
 */
import { Logger } from "../../logging";
import { existsSync, promises as fsPromises, statSync } from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import type { CacheState, CacheFile } from "./types";

// Tamanho máximo padrão do cache: 2GB
const DEFAULT_MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024;
// Idade máxima: 30 dias
const DEFAULT_MAX_AGE_DAYS = 30;

export class TomcatDownloadCache {
    private logger = Logger.getInstance();
    private cacheDir: string;
    private maxSize: number;
    private maxAgeDays: number;

    constructor(options?: { 
        cacheDir?: string; 
        maxSize?: number; 
        maxAgeDays?: number;
    }) {
        this.cacheDir = options?.cacheDir || path.join(os.homedir(), ".xavva", "downloads");
        this.maxSize = options?.maxSize || DEFAULT_MAX_CACHE_SIZE;
        this.maxAgeDays = options?.maxAgeDays || DEFAULT_MAX_AGE_DAYS;
        this.ensureCacheDir();
    }

    /**
     * Retorna diretório do cache
     */
    getCacheDir(): string {
        return this.cacheDir;
    }

    /**
     * Gera chave de cache baseada na URL
     */
    getCacheKey(url: string): string {
        const urlHash = createHash("md5").update(url).digest("hex");
        const filename = path.basename(url);
        return `${urlHash}_${filename}`;
    }

    /**
     * Retorna caminho completo do arquivo em cache
     */
    getCachePath(url: string): string {
        return path.join(this.cacheDir, this.getCacheKey(url));
    }

    /**
     * Verifica se arquivo está em cache
     */
    has(url: string): boolean {
        return existsSync(this.getCachePath(url));
    }

    /**
     * Busca arquivo em cache
     */
    async get(url: string): Promise<{ path: string; size: number } | null> {
        const cachePath = this.getCachePath(url);
        
        if (!existsSync(cachePath)) {
            return null;
        }

        const stats = await fsPromises.stat(cachePath);
        
        // Verifica idade
        const age = Date.now() - stats.mtimeMs;
        const maxAge = this.maxAgeDays * 24 * 60 * 60 * 1000;
        
        if (age > maxAge) {
            this.logger.debug(`Cache expirado para ${url}`);
            await fsPromises.unlink(cachePath).catch(() => {});
            return null;
        }

        // Atualiza timestamp de acesso
        await fsPromises.utimes(cachePath, new Date(), stats.mtime);

        return {
            path: cachePath,
            size: stats.size
        };
    }

    /**
     * Adiciona arquivo ao cache
     */
    async set(url: string, sourcePath: string): Promise<void> {
        const cachePath = this.getCachePath(url);
        
        // Verifica se precisa limpar antes
        await this.cleanupIfNeeded();

        // Copia arquivo
        await fsPromises.copyFile(sourcePath, cachePath);
        
        this.logger.debug(`Arquivo adicionado ao cache: ${path.basename(url)}`);
    }

    /**
     * Copia do cache para destino
     */
    async copyFromCache(url: string, destPath: string): Promise<boolean> {
        const cachePath = this.getCachePath(url);
        
        if (!existsSync(cachePath)) {
            return false;
        }

        await fsPromises.copyFile(cachePath, destPath);
        return true;
    }

    /**
     * Retorna estatísticas do cache
     */
    async getState(): Promise<CacheState> {
        const files: CacheFile[] = [];
        let totalSize = 0;

        if (!existsSync(this.cacheDir)) {
            return {
                enabled: true,
                dir: this.cacheDir,
                size: 0,
                files: []
            };
        }

        const entries = await fsPromises.readdir(this.cacheDir);
        
        for (const entry of entries) {
            const filePath = path.join(this.cacheDir, entry);
            const stats = await fsPromises.stat(filePath);
            
            if (stats.isFile()) {
                const file: CacheFile = {
                    name: entry,
                    size: stats.size,
                    modified: stats.mtime,
                    checksum: "" // Pode ser calculado sob demanda
                };
                files.push(file);
                totalSize += stats.size;
            }
        }

        // Ordena por data de modificação (mais recente primeiro)
        files.sort((a, b) => b.modified.getTime() - a.modified.getTime());

        return {
            enabled: true,
            dir: this.cacheDir,
            size: totalSize,
            files
        };
    }

    /**
     * Limpa arquivos antigos se necessário
     */
    async cleanupIfNeeded(): Promise<void> {
        const state = await this.getState();
        
        if (state.size <= this.maxSize) {
            return;
        }

        this.logger.info(`Limpando cache (${this.formatBytes(state.size)} > ${this.formatBytes(this.maxSize)})`);

        // Remove arquivos mais antigos até ficar abaixo do limite
        const targetSize = this.maxSize * 0.8; // 80% do máximo
        let currentSize = state.size;

        for (const file of state.files) {
            if (currentSize <= targetSize) break;

            const filePath = path.join(this.cacheDir, file.name);
            await fsPromises.unlink(filePath).catch(() => {});
            currentSize -= file.size;
        }

        this.logger.info(`Cache limpo: ${this.formatBytes(currentSize)}`);
    }

    /**
     * Limpa todo o cache
     */
    async clear(): Promise<void> {
        this.logger.info("Limpando cache de downloads...");
        
        if (!existsSync(this.cacheDir)) {
            return;
        }

        const entries = await fsPromises.readdir(this.cacheDir);
        let count = 0;

        for (const entry of entries) {
            const filePath = path.join(this.cacheDir, entry);
            await fsPromises.unlink(filePath).catch(() => {});
            count++;
        }

        this.logger.success(`${count} arquivo(s) removido(s) do cache`);
    }

    /**
     * Retorna tamanho usado pelo cache
     */
    async getSize(): Promise<number> {
        const state = await this.getState();
        return state.size;
    }

    /**
     * Formata bytes para legível
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
    private ensureCacheDir(): void {
        if (!existsSync(this.cacheDir)) {
            fsPromises.mkdir(this.cacheDir, { recursive: true });
        }
    }
}
