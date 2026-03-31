/**
 * Utilitários de Segurança
 * 
 * - Sanitização de inputs
 * - Validação de paths (path traversal prevention)
 * - Sanitização de argumentos de shell
 */

import path from "path";
import { createHash } from "crypto";
import { Logger } from "../logging";

export class SecurityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SecurityError";
    }
}

/**
 * Sanitiza path para prevenir path traversal
 */
export function sanitizePath(input: string, baseDir: string = process.cwd()): string {
    // Remove null bytes
    if (input.includes('\0')) {
        throw new SecurityError("Path contém caracteres nulos");
    }

    // Normaliza o path
    const normalized = path.normalize(input);
    
    // Resolve para path absoluto
    const resolved = path.resolve(baseDir, normalized);
    
    // Garante que está dentro do diretório base
    const resolvedBase = path.resolve(baseDir);
    if (!resolved.startsWith(resolvedBase)) {
        throw new SecurityError(`Path traversal detectado: ${input}`);
    }
    
    return resolved;
}

/**
 * Sanitiza argumentos de shell
 */
export function sanitizeShellArg(input: string): string {
    // Remove caracteres perigosos
    const dangerous = /[;&|`$(){}[\]\\<>!#*?]/g;
    
    if (dangerous.test(input)) {
        throw new SecurityError(`Argumento contém caracteres perigosos: ${input}`);
    }
    
    return input;
}

/**
 * Valida nome de arquivo
 */
export function validateFilename(filename: string): string {
    // Caracteres proibidos em nomes de arquivo
    const forbidden = /[<>:"/\\|?*\0]/;
    
    if (forbidden.test(filename)) {
        throw new SecurityError(`Nome de arquivo inválido: ${filename}`);
    }
    
    // Não permite paths absolutos
    if (path.isAbsolute(filename)) {
        throw new SecurityError(`Caminho absoluto não permitido: ${filename}`);
    }
    
    // Não permite .. ou .
    if (filename.includes('..') || filename === '.') {
        throw new SecurityError(`Path traversal detectado: ${filename}`);
    }
    
    return filename;
}

/**
 * Valida porta
 */
export function validatePortNumber(port: number | string): number {
    const num = typeof port === 'string' ? parseInt(port, 10) : port;
    
    if (isNaN(num) || num < 1 || num > 65535) {
        throw new SecurityError(`Porta inválida: ${port}`);
    }
    
    // Portas privilegiadas (1-1024) requerem root
    if (num < 1024) {
        throw new SecurityError(`Portas privilegiadas (1-1024) não permitidas: ${port}`);
    }
    
    return num;
}

/**
 * Valida URL
 */
export function validateUrl(url: string, allowedProtocols: string[] = ['http:', 'https:']): string {
    try {
        const parsed = new URL(url);
        
        if (!allowedProtocols.includes(parsed.protocol)) {
            throw new SecurityError(`Protocolo não permitido: ${parsed.protocol}`);
        }
        
        // Bloqueia localhost em produção (opcional)
        if (process.env.NODE_ENV === 'production') {
            const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
            if (blockedHosts.includes(parsed.hostname)) {
                throw new SecurityError(`Host não permitido: ${parsed.hostname}`);
            }
        }
        
        return url;
    } catch (e) {
        if (e instanceof SecurityError) throw e;
        throw new SecurityError(`URL inválida: ${url}`);
    }
}

/**
 * Computa hash SHA-256 de arquivo
 */
export async function computeFileHash(filePath: string): Promise<string> {
    const file = Bun.file(filePath);
    const buffer = await file.arrayBuffer();
    const hash = createHash('sha256').update(Buffer.from(buffer)).digest('hex');
    return hash;
}

/**
 * Verifica checksum de arquivo
 */
export async function verifyChecksum(
    filePath: string, 
    expectedHash: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
): Promise<boolean> {
    const logger = Logger.getInstance();
    
    logger.debug(`Verificando checksum de ${path.basename(filePath)}`);
    
    const file = Bun.file(filePath);
    const buffer = await file.arrayBuffer();
    const hash = createHash(algorithm).update(Buffer.from(buffer)).digest('hex');
    
    if (hash !== expectedHash.toLowerCase()) {
        logger.error(`Checksum mismatch!`);
        logger.error(`  Esperado: ${expectedHash}`);
        logger.error(`  Obtido:   ${hash}`);
        return false;
    }
    
    logger.debug(`Checksum verificado com sucesso`);
    return true;
}

/**
 * Verifica checksum de arquivo baixado
 */
export async function verifyDownloadChecksum(
    filePath: string,
    checksumUrl: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
): Promise<boolean> {
    const logger = Logger.getInstance();
    
    try {
        logger.debug(`Baixando checksum de ${checksumUrl}`);
        
        const response = await fetch(checksumUrl);
        if (!response.ok) {
            logger.warn(`Não foi possível baixar checksum: ${response.status}`);
            return true; // Permite continuar sem checksum
        }
        
        const checksumContent = await response.text();
        const expectedHash = checksumContent.trim().split(/\s+/)[0];
        
        return await verifyChecksum(filePath, expectedHash, algorithm);
    } catch (error) {
        logger.warn(`Erro ao verificar checksum: ${(error as Error).message}`);
        return true; // Permite continuar em caso de erro
    }
}

/**
 * Escapa string para uso em regex
 */
export function escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Valida entrada de usuário (básica)
 */
export function validateUserInput(input: string, maxLength: number = 1000): string {
    if (typeof input !== 'string') {
        throw new SecurityError("Input deve ser uma string");
    }
    
    if (input.length > maxLength) {
        throw new SecurityError(`Input excede tamanho máximo de ${maxLength} caracteres`);
    }
    
    // Remove caracteres de controle (exceto whitespace)
    const sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    return sanitized;
}

/**
 * Sanitiza variáveis de ambiente
 */
export function sanitizeEnvVar(name: string, value: string): { name: string; value: string } {
    // Nomes de variáveis devem seguir [a-zA-Z_][a-zA-Z0-9_]*
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        throw new SecurityError(`Nome de variável de ambiente inválido: ${name}`);
    }
    
    // Remove caracteres nulos
    const cleanValue = value.replace(/\0/g, '');
    
    return { name, value: cleanValue };
}

/**
 * Wrapper seguro para execução de comandos
 */
export function createSafeCommand(
    command: string, 
    args: string[]
): { command: string; args: string[] } {
    // Sanitiza cada argumento
    const sanitizedArgs = args.map(arg => {
        // Se contém espaços, precisa de quotes
        if (arg.includes(' ')) {
            // Verifica se já está quoted
            if ((arg.startsWith('"') && arg.endsWith('"')) || 
                (arg.startsWith("'") && arg.endsWith("'"))) {
                return arg;
            }
            // Escapa quotes internos e envolve
            return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return sanitizeShellArg(arg);
    });
    
    return { command: sanitizeShellArg(command), args: sanitizedArgs };
}

/**
 * Rate limiting simples
 */
export class RateLimiter {
    private requests: Map<string, number[]> = new Map();
    private windowMs: number;
    private maxRequests: number;

    constructor(windowMs: number = 60000, maxRequests: number = 100) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
    }

    isAllowed(key: string): boolean {
        const now = Date.now();
        const timestamps = this.requests.get(key) || [];
        
        // Remove timestamps antigos
        const validTimestamps = timestamps.filter(t => now - t < this.windowMs);
        
        if (validTimestamps.length >= this.maxRequests) {
            return false;
        }
        
        validTimestamps.push(now);
        this.requests.set(key, validTimestamps);
        return true;
    }

    reset(key?: string): void {
        if (key) {
            this.requests.delete(key);
        } else {
            this.requests.clear();
        }
    }
}
