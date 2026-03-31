/**
 * Verificador de checksum SHA512 para arquivos Tomcat
 * 
 * Features:
 * - Download e validação de checksums oficiais
 * - Verificação SHA512 local
 * - Cache de checksums
 */
import { Logger } from "../../logging";
import { createHash } from "crypto";
import { existsSync, promises as fsPromises } from "fs";
import path from "path";
import os from "os";

export interface ChecksumResult {
    valid: boolean;
    expected: string;
    actual: string;
    algorithm: string;
}

export class TomcatChecksumVerifier {
    private logger = Logger.getInstance();
    private cacheDir: string;
    private checksumCache: Map<string, string> = new Map();

    constructor() {
        this.cacheDir = path.join(os.homedir(), ".xavva", "checksums");
        this.ensureCacheDir();
    }

    /**
     * Calcula SHA512 de um arquivo local
     */
    async calculateHash(filePath: string): Promise<string> {
        if (!existsSync(filePath)) {
            throw new Error(`Arquivo não encontrado: ${filePath}`);
        }

        const hash = createHash("sha512");
        const file = await fsPromises.open(filePath, "r");
        
        try {
            const buffer = Buffer.alloc(64 * 1024); // 64KB chunks
            let bytesRead: number;
            
            do {
                bytesRead = (await file.read(buffer, 0, buffer.length, null)).bytesRead;
                if (bytesRead > 0) {
                    hash.update(buffer.subarray(0, bytesRead));
                }
            } while (bytesRead === buffer.length);
            
            return hash.digest("hex").toLowerCase();
        } finally {
            await file.close();
        }
    }

    /**
     * Baixa checksum oficial do Apache
     */
    async downloadChecksum(url: string): Promise<string | null> {
        try {
            // Verifica cache primeiro
            const cacheKey = this.getCacheKey(url);
            const cached = this.checksumCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            const response = await fetch(url, { method: "GET" });
            
            if (!response.ok) {
                this.logger.warn(`Não foi possível baixar checksum: HTTP ${response.status}`);
                return null;
            }

            const content = await response.text();
            
            // Parse do formato: <hash> *<filename>
            // Ex: a1b2c3... *apache-tomcat-10.1.52.zip
            const match = content.match(/^([a-f0-9]+)\s+\*/mi);
            if (match) {
                const checksum = match[1].toLowerCase();
                this.checksumCache.set(cacheKey, checksum);
                return checksum;
            }

            // Formato alternativo: só o hash
            const hashMatch = content.trim().match(/^([a-f0-9]{128})$/i);
            if (hashMatch) {
                const checksum = hashMatch[1].toLowerCase();
                this.checksumCache.set(cacheKey, checksum);
                return checksum;
            }

            return null;
        } catch (error) {
            this.logger.warn(`Erro ao baixar checksum: ${error}`);
            return null;
        }
    }

    /**
     * Verifica arquivo contra checksum esperado
     */
    async verify(filePath: string, expectedChecksum: string): Promise<ChecksumResult> {
        this.logger.info("Verificando integridade do arquivo...");
        
        const actualChecksum = await this.calculateHash(filePath);
        const normalized = expectedChecksum.toLowerCase().trim();
        
        const result: ChecksumResult = {
            valid: actualChecksum === normalized,
            expected: normalized,
            actual: actualChecksum,
            algorithm: "SHA512"
        };

        if (result.valid) {
            this.logger.success("Checksum válido!");
        } else {
            this.logger.error("Checksum inválido!");
            this.logger.error(`  Esperado: ${result.expected.substring(0, 16)}...`);
            this.logger.error(`  Obtido:   ${result.actual.substring(0, 16)}...`);
        }

        return result;
    }

    /**
     * Verifica arquivo baixando checksum automaticamente
     */
    async verifyFromUrl(filePath: string, checksumUrl: string): Promise<ChecksumResult> {
        const expected = await this.downloadChecksum(checksumUrl);
        
        if (!expected) {
            this.logger.warn("Não foi possível obter checksum oficial");
            return {
                valid: false,
                expected: "",
                actual: "",
                algorithm: "SHA512"
            };
        }

        return this.verify(filePath, expected);
    }

    /**
     * Salva checksum em cache local
     */
    async saveToCache(url: string, checksum: string): Promise<void> {
        const cacheFile = path.join(this.cacheDir, this.getCacheKey(url) + ".sha512");
        await fsPromises.writeFile(cacheFile, checksum, "utf-8");
        this.checksumCache.set(this.getCacheKey(url), checksum);
    }

    /**
     * Carrega checksum do cache local
     */
    async loadFromCache(url: string): Promise<string | null> {
        const cacheKey = this.getCacheKey(url);
        
        if (this.checksumCache.has(cacheKey)) {
            return this.checksumCache.get(cacheKey)!;
        }

        const cacheFile = path.join(this.cacheDir, cacheKey + ".sha512");
        
        if (existsSync(cacheFile)) {
            const checksum = await fsPromises.readFile(cacheFile, "utf-8");
            this.checksumCache.set(cacheKey, checksum.trim());
            return checksum.trim();
        }

        return null;
    }

    /**
     * Gera chave de cache para URL
     */
    private getCacheKey(url: string): string {
        // Hash da URL para nome de arquivo seguro
        return createHash("md5").update(url).digest("hex");
    }

    /**
     * Garante que diretório de cache existe
     */
    private ensureCacheDir(): void {
        if (!existsSync(this.cacheDir)) {
            fsPromises.mkdir(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Limpa cache de checksums
     */
    async clearCache(): Promise<void> {
        this.checksumCache.clear();
        
        if (existsSync(this.cacheDir)) {
            const files = await fsPromises.readdir(this.cacheDir);
            for (const file of files) {
                await fsPromises.unlink(path.join(this.cacheDir, file));
            }
        }
    }
}
