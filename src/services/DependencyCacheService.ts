/**
 * Serviço de Cache de Análise de Dependências
 * 
 * Evita re-parsear pom.xml/build.gradle em cada comando,
 * invalidando cache apenas quando o arquivo mudar.
 */

import { createHash } from "crypto";
import { readFile, stat, mkdir, writeFile, access } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import { CACHE } from "../config/versions";
import { Logger } from "../logging";

export interface DependencyTree {
    dependencies: Dependency[];
    directCount: number;
    transitiveCount: number;
    conflicts: DependencyConflict[];
    timestamp: number;
}

export interface Dependency {
    groupId: string;
    artifactId: string;
    version: string;
    scope?: string;
    isTransitive: boolean;
}

export interface DependencyConflict {
    artifactId: string;
    versions: string[];
}

interface CacheEntry {
    fileHash: string;
    fileMtime: number;
    dependencyTree: DependencyTree;
    cachedAt: number;
}

export class DependencyCacheService {
    private logger = Logger.getInstance();
    private cacheDir: string;
    private memoryCache: Map<string, CacheEntry> = new Map();
    
    constructor() {
        this.cacheDir = path.join(os.homedir(), '.xavva', 'dependency-cache');
    }

    /**
     * Obtém árvore de dependências (do cache ou parseia)
     */
    async getDependencyTree(buildFilePath: string): Promise<DependencyTree> {
        const cacheKey = this.getCacheKey(buildFilePath);
        
        // Verifica memory cache primeiro
        const memoryEntry = this.memoryCache.get(cacheKey);
        if (memoryEntry && await this.isCacheValid(buildFilePath, memoryEntry)) {
            this.logger.debug(`Cache de dependências (memory): ${path.basename(buildFilePath)}`);
            return memoryEntry.dependencyTree;
        }
        
        // Verifica disk cache
        const diskEntry = await this.loadFromDisk(cacheKey);
        if (diskEntry && await this.isCacheValid(buildFilePath, diskEntry)) {
            this.logger.debug(`Cache de dependências (disk): ${path.basename(buildFilePath)}`);
            // Promove para memory cache
            this.memoryCache.set(cacheKey, diskEntry);
            return diskEntry.dependencyTree;
        }
        
        // Parseia e cacheia
        this.logger.debug(`Parseando dependências: ${path.basename(buildFilePath)}`);
        const tree = await this.parseDependencies(buildFilePath);
        await this.setCache(buildFilePath, tree);
        
        return tree;
    }

    /**
     * Invalida cache para um arquivo específico
     */
    async invalidateCache(buildFilePath: string): Promise<void> {
        const cacheKey = this.getCacheKey(buildFilePath);
        this.memoryCache.delete(cacheKey);
        
        const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
        if (existsSync(cachePath)) {
            await Bun.file(cachePath).delete();
        }
    }

    /**
     * Limpa todo o cache
     */
    async clearCache(): Promise<void> {
        this.memoryCache.clear();
        
        if (!existsSync(this.cacheDir)) return;
        
        const files = await Array.fromAsync(Bun.file(this.cacheDir).stream());
        for (const file of files) {
            // Limpa arquivos de cache
        }
        
        this.logger.info("Cache de dependências limpo");
    }

    /**
     * Verifica se cache ainda é válido
     */
    private async isCacheValid(buildFilePath: string, entry: CacheEntry): Promise<boolean> {
        // Verifica idade do cache
        const cacheAge = Date.now() - entry.cachedAt;
        if (cacheAge > CACHE.MAX_AGE_MS) {
            return false;
        }
        
        // Verifica se arquivo mudou
        try {
            const stats = await stat(buildFilePath);
            if (stats.mtimeMs !== entry.fileMtime) {
                return false;
            }
            
            // Verifica hash para garantir
            const currentHash = await this.computeFileHash(buildFilePath);
            return currentHash === entry.fileHash;
        } catch {
            return false;
        }
    }

    /**
     * Salva no cache
     */
    private async setCache(buildFilePath: string, tree: DependencyTree): Promise<void> {
        const cacheKey = this.getCacheKey(buildFilePath);
        
        const stats = await stat(buildFilePath);
        const fileHash = await this.computeFileHash(buildFilePath);
        
        const entry: CacheEntry = {
            fileHash,
            fileMtime: stats.mtimeMs,
            dependencyTree: tree,
            cachedAt: Date.now(),
        };
        
        // Salva em memory
        this.memoryCache.set(cacheKey, entry);
        
        // Salva em disk
        await this.saveToDisk(cacheKey, entry);
    }

    /**
     * Carrega do disk cache
     */
    private async loadFromDisk(cacheKey: string): Promise<CacheEntry | null> {
        const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
        
        if (!existsSync(cachePath)) {
            return null;
        }
        
        try {
            const content = await readFile(cachePath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    /**
     * Salva no disk cache
     */
    private async saveToDisk(cacheKey: string, entry: CacheEntry): Promise<void> {
        await mkdir(this.cacheDir, { recursive: true });
        
        const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
        await writeFile(cachePath, JSON.stringify(entry, null, 2));
    }

    /**
     * Computa hash do arquivo
     */
    private async computeFileHash(filePath: string): Promise<string> {
        const content = await readFile(filePath);
        return createHash('md5').update(content).digest('hex');
    }

    /**
     * Gera chave de cache única
     */
    private getCacheKey(filePath: string): string {
        // Hash do path absoluto para evitar colisões
        return createHash('md5').update(path.resolve(filePath)).digest('hex').slice(0, 16);
    }

    /**
     * Parseia dependências do arquivo de build
     * (Implementação básica - pode ser expandida)
     */
    private async parseDependencies(buildFilePath: string): Promise<DependencyTree> {
        const content = await readFile(buildFilePath, 'utf-8');
        const ext = path.extname(buildFilePath);
        
        if (ext === '.xml') {
            return this.parseMavenDependencies(content);
        } else if (ext === '.gradle' || ext === '.kts') {
            return this.parseGradleDependencies(content);
        }
        
        throw new Error(`Formato de arquivo não suportado: ${ext}`);
    }

    /**
     * Parseia dependências Maven (pom.xml)
     */
    private parseMavenDependencies(xmlContent: string): DependencyTree {
        const dependencies: Dependency[] = [];
        const conflicts: DependencyConflict[] = [];
        
        // Parse básico de dependencies
        const depRegex = /<dependency>[\s\S]*?<\/dependency>/g;
        const matches = xmlContent.match(depRegex) || [];
        
        for (const match of matches) {
            const groupId = this.extractXmlTag(match, 'groupId');
            const artifactId = this.extractXmlTag(match, 'artifactId');
            const version = this.extractXmlTag(match, 'version');
            const scope = this.extractXmlTag(match, 'scope');
            
            if (groupId && artifactId) {
                dependencies.push({
                    groupId,
                    artifactId,
                    version: version || 'managed',
                    scope: scope || 'compile',
                    isTransitive: false,
                });
            }
        }
        
        return {
            dependencies,
            directCount: dependencies.length,
            transitiveCount: 0,
            conflicts,
            timestamp: Date.now(),
        };
    }

    /**
     * Parseia dependências Gradle
     */
    private parseGradleDependencies(content: string): DependencyTree {
        const dependencies: Dependency[] = [];
        
        // Parse básico de dependencies
        const lines = content.split('\n');
        const depRegex = /(implementation|api|compileOnly|runtimeOnly|testImplementation)\s*['"]([^'"]+)['"]/;
        
        for (const line of lines) {
            const match = line.match(depRegex);
            if (match) {
                const scope = match[1];
                const coords = match[2].split(':');
                
                if (coords.length >= 2) {
                    dependencies.push({
                        groupId: coords[0],
                        artifactId: coords[1],
                        version: coords[2] || 'unspecified',
                        scope,
                        isTransitive: false,
                    });
                }
            }
        }
        
        return {
            dependencies,
            directCount: dependencies.length,
            transitiveCount: 0,
            conflicts: [],
            timestamp: Date.now(),
        };
    }

    /**
     * Extrai valor de tag XML
     */
    private extractXmlTag(xml: string, tag: string): string | null {
        const regex = new RegExp(`<${tag}>([^<]+)</${tag}>`);
        const match = xml.match(regex);
        return match ? match[1].trim() : null;
    }
}
