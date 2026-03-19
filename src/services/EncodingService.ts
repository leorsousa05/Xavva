import { promises as fs, existsSync, mkdirSync, createReadStream, createWriteStream } from "fs";
import path from "path";
import { Logger } from "../utils/ui";

// Mapeamento de encoding aliases
const ENCODING_ALIASES: Record<string, string> = {
    "utf8": "utf-8",
    "utf-8": "utf-8",
    "cp1252": "windows-1252",
    "windows-1252": "windows-1252",
    "latin1": "iso-8859-1",
    "iso-8859-1": "iso-8859-1",
    "iso88591": "iso-8859-1",
    "cp850": "ibm850",
};

// Encodings suportados
const SUPPORTED_ENCODINGS = ["utf-8", "windows-1252", "iso-8859-1"];

// Bytes caracteristicos de UTF-8 para deteccao
const UTF8_BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

export interface DetectedEncoding {
    encoding: string;
    confidence: number;
    hasBOM: boolean;
}

export class EncodingService {
    private backupDir: string;

    constructor() {
        this.backupDir = path.join(process.cwd(), ".xavva", "encoding-backups");
    }

    /**
     * Normaliza o nome do encoding
     */
    normalizeEncoding(encoding: string): string {
        const normalized = encoding.toLowerCase().replace(/[_\s]/g, "-");
        return ENCODING_ALIASES[normalized] || normalized;
    }

    /**
     * Verifica se um encoding e suportado
     */
    isValidEncoding(encoding: string): boolean {
        const normalized = this.normalizeEncoding(encoding);
        return SUPPORTED_ENCODINGS.includes(normalized);
    }

    /**
     * Retorna lista de encodings suportados
     */
    getSupportedEncodings(): string[] {
        return [...SUPPORTED_ENCODINGS];
    }

    /**
     * Detecta o encoding de um buffer
     * Implementacao simplificada baseada em heuristicas
     */
    detectEncoding(buffer: Buffer): DetectedEncoding {
        // Verifica BOM
        if (buffer.length >= 3) {
            if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                return { encoding: "utf-8", confidence: 1, hasBOM: true };
            }
            if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
                return { encoding: "utf-16be", confidence: 1, hasBOM: true };
            }
            if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
                return { encoding: "utf-16le", confidence: 1, hasBOM: true };
            }
        }

        // Heuristica: conta bytes validos UTF-8 vs invalidos
        let utf8Valid = 0;
        let utf8Invalid = 0;
        let highBytes = 0; // Bytes > 127

        for (let i = 0; i < buffer.length; i++) {
            const byte = buffer[i];

            if (byte > 127) {
                highBytes++;

                // Verifica se e inicio de sequencia UTF-8 multi-byte
                if ((byte & 0xE0) === 0xC0) {
                    // 2-byte sequence
                    if (i + 1 < buffer.length && (buffer[i + 1] & 0xC0) === 0x80) {
                        utf8Valid++;
                        i++;
                    } else {
                        utf8Invalid++;
                    }
                } else if ((byte & 0xF0) === 0xE0) {
                    // 3-byte sequence
                    if (i + 2 < buffer.length && 
                        (buffer[i + 1] & 0xC0) === 0x80 && 
                        (buffer[i + 2] & 0xC0) === 0x80) {
                        utf8Valid++;
                        i += 2;
                    } else {
                        utf8Invalid++;
                    }
                } else if ((byte & 0xF8) === 0xF0) {
                    // 4-byte sequence
                    if (i + 3 < buffer.length && 
                        (buffer[i + 1] & 0xC0) === 0x80 && 
                        (buffer[i + 2] & 0xC0) === 0x80 && 
                        (buffer[i + 3] & 0xC0) === 0x80) {
                        utf8Valid++;
                        i += 3;
                    } else {
                        utf8Invalid++;
                    }
                } else {
                    utf8Invalid++;
                }
            }
        }

        // Se tem bytes altos e todos sao validos UTF-8, provavelmente e UTF-8
        if (highBytes > 0 && utf8Invalid === 0 && utf8Valid > 0) {
            return { encoding: "utf-8", confidence: 0.95, hasBOM: false };
        }

        // Se tem bytes altos invalidos em UTF-8, provavelmente e single-byte encoding
        if (highBytes > 0 && utf8Invalid > 0) {
            // No contexto brasileiro/Windows, provavelmente e Windows-1252
            return { encoding: "windows-1252", confidence: 0.7, hasBOM: false };
        }

        // Se nao tem bytes altos, pode ser ASCII/UTF-8/Latin1
        return { encoding: "utf-8", confidence: 0.5, hasBOM: false };
    }

    /**
     * Detecta encoding de um arquivo
     */
    async detectFileEncoding(filePath: string): Promise<DetectedEncoding | null> {
        try {
            const buffer = await fs.readFile(filePath);
            return this.detectEncoding(buffer);
        } catch (e) {
            return null;
        }
    }

    /**
     * Cria backup de um arquivo antes da conversao
     */
    async createBackup(filePath: string): Promise<string> {
        if (!existsSync(this.backupDir)) {
            mkdirSync(this.backupDir, { recursive: true });
        }

        const fileName = path.basename(filePath);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupPath = path.join(this.backupDir, `${fileName}.${timestamp}.bak`);

        await fs.copyFile(filePath, backupPath);
        return backupPath;
    }

    /**
     * Converte arquivo de um encoding para outro
     */
    async convertFile(
        filePath: string, 
        fromEncoding: string, 
        toEncoding: string,
        options: { backup?: boolean; dryRun?: boolean } = {}
    ): Promise<{ success: boolean; message: string; unsupportedChars?: string[] }> {
        try {
            if (!existsSync(filePath)) {
                return { success: false, message: `Arquivo nao encontrado: ${filePath}` };
            }

            const normalizedFrom = this.normalizeEncoding(fromEncoding);
            const normalizedTo = this.normalizeEncoding(toEncoding);

            if (normalizedFrom === normalizedTo) {
                return { success: true, message: "Encodings iguais, nenhuma conversao necessaria" };
            }

            // Le o arquivo como buffer
            const buffer = await fs.readFile(filePath);

            // Se tem BOM UTF-8, remove para processamento
            let contentBuffer = buffer;
            let hadBOM = false;
            if (buffer.length >= 3 && 
                buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                contentBuffer = buffer.slice(3);
                hadBOM = true;
            }

            // Decodifica do encoding de origem
            let content: string;
            try {
                // Usa TextDecoder para encodings padrao ou iconv-lite para Windows-1252
                if (normalizedFrom === "utf-8") {
                    content = contentBuffer.toString("utf-8");
                } else {
                    // Para Windows-1252 e outros single-byte, usamos decoding manual
                    content = this.decodeSingleByte(contentBuffer, normalizedFrom);
                }
            } catch (e) {
                return { success: false, message: `Erro ao decodificar de ${fromEncoding}: ${e}` };
            }

            if (options.dryRun) {
                return { 
                    success: true, 
                    message: `[DRY RUN] Converteria de ${fromEncoding} para ${toEncoding}` 
                };
            }

            // Cria backup se solicitado
            if (options.backup) {
                const backupPath = await this.createBackup(filePath);
                Logger.debug(`Backup criado: ${backupPath}`);
            }

            // Codifica para o encoding destino
            let outputBuffer: Buffer;
            const unsupportedChars: string[] = [];
            
            if (normalizedTo === "utf-8") {
                outputBuffer = Buffer.from(content, "utf-8");
                // Adiciona BOM se o original tinha
                if (hadBOM) {
                    outputBuffer = Buffer.concat([UTF8_BOM, outputBuffer]);
                }
            } else {
                const result = this.encodeSingleByte(content, normalizedTo);
                outputBuffer = result.buffer;
                unsupportedChars.push(...result.unsupportedChars);
            }

            await fs.writeFile(filePath, outputBuffer);

            let message = `Convertido: ${fromEncoding} -> ${toEncoding}`;
            if (unsupportedChars.length > 0) {
                const unique = [...new Set(unsupportedChars)].slice(0, 5);
                // Mostra o código Unicode em vez do caractere (evita ? no terminal)
                const codes = unique.map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')} (${c})`);
                message += ` (${unsupportedChars.length} caractere(s) nao suportado(s): ${codes.join(", ")})`;
            }

            return { 
                success: true, 
                message,
                unsupportedChars: unsupportedChars.length > 0 ? unsupportedChars : undefined
            };

        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { success: false, message: `Erro: ${error}` };
        }
    }

    /**
     * Tenta corrigir mojibake (texto corrompido por encoding errado)
     * Ex: A�o -> Acao
     */
    async fixMojibake(
        filePath: string, 
        options: { backup?: boolean; dryRun?: boolean; force?: boolean } = {}
    ): Promise<{ success: boolean; message: string; detectedFrom?: string }> {
        try {
            if (!existsSync(filePath)) {
                return { success: false, message: `Arquivo nao encontrado: ${filePath}` };
            }

            const buffer = await fs.readFile(filePath);
            const detection = this.detectEncoding(buffer);

            // Se ja e UTF-8, nao precisa converter (a menos que force=true)
            if (detection.encoding === "utf-8" && detection.confidence > 0.8 && !options.force) {
                // Mas verifica se tem padrões de mojibake comuns
                const content = buffer.toString("utf-8");
                const hasMojibake = /[\u00EF\u00BF\u00BD\u00C3\u00A0-\u00C3\u00B9]/.test(content);
                
                if (!hasMojibake) {
                    return { success: true, message: "Arquivo ja esta em UTF-8", detectedFrom: "utf-8" };
                }
                // Se tem mojibake, continua com a correção mesmo sendo UTF-8
            }

            // Tenta converter assumindo que esta em Windows-1252 mas foi lido como UTF-8
            // Ou vice-versa
            let fixed = false;
            let usedEncoding = "";

            // Tenta interpretar como Windows-1252
            try {
                const asLatin1 = buffer.toString("latin1");
                const reencoded = Buffer.from(asLatin1, "utf-8");
                const redecoded = reencoded.toString("utf-8");
                
                // Se o resultado tem caracteres legiveis comuns em portugues, provavelmente funcionou
                if (this.looksLikePortuguese(redecoded)) {
                    if (!options.dryRun) {
                        if (options.backup) {
                            await this.createBackup(filePath);
                        }
                        await fs.writeFile(filePath, reencoded);
                    }
                    fixed = true;
                    usedEncoding = "windows-1252";
                }
            } catch (e) {
                // ignora
            }

            if (fixed) {
                return { 
                    success: true, 
                    message: options.dryRun ? 
                        `[DRY RUN] Corrigiria mojibake (detectado: ${usedEncoding})` : 
                        `Mojibake corrigido! (detectado: ${usedEncoding})`,
                    detectedFrom: usedEncoding
                };
            }

            return { 
                success: false, 
                message: "Nao foi possivel detectar/corrigir o mojibake automaticamente",
                detectedFrom: detection.encoding
            };

        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { success: false, message: `Erro: ${error}` };
        }
    }

    /**
     * Verifica se uma string parece portugues valido
     */
    private looksLikePortuguese(text: string): boolean {
        // Conta caracteres comuns em portugues
        const portugueseChars = /[\u00E1\u00E0\u00E2\u00E3\u00E9\u00EA\u00ED\u00F3\u00F4\u00F5\u00FA\u00FC\u00E7\u00C1\u00C0\u00C2\u00C3\u00C9\u00CA\u00CD\u00D3\u00D4\u00D5\u00DA\u00DC\u00C7]/g;
        const matches = text.match(portugueseChars);
        
        // Se tem caracteres acentuados brasileiros, provavelmente e portugues
        if (matches && matches.length > 0) {
            return true;
        }

        // Verifica sequencias suspeitas de mojibake
        const mojibakePatterns = /[\u00EF\u00BF\u00BD\u00C3\u00A1]/;
        return !mojibakePatterns.test(text);
    }

    /**
     * Decodifica buffer single-byte (Windows-1252, ISO-8859-1)
     */
    private decodeSingleByte(buffer: Buffer, encoding: string): string {
        // Mapeamento Windows-1252 para Unicode
        const windows1252Map: Record<number, string> = {
            0x80: "\u20AC", 0x82: "\u201A", 0x83: "\u0192", 0x84: "\u201E", 0x85: "\u2026", 
            0x86: "\u2020", 0x87: "\u2021", 0x88: "\u02C6", 0x89: "\u2030", 0x8A: "\u0160",
            0x8B: "\u2039", 0x8C: "\u0152", 0x8E: "\u017D", 0x91: "\u2018", 0x92: "\u2019",
            0x93: "\u201C", 0x94: "\u201D", 0x95: "\u2022", 0x96: "\u2013", 0x97: "\u2014",
            0x98: "\u02DC", 0x99: "\u2122", 0x9A: "\u0161", 0x9B: "\u203A", 0x9C: "\u0153",
            0x9E: "\u017E", 0x9F: "\u0178",
        };

        let result = "";
        for (let i = 0; i < buffer.length; i++) {
            const byte = buffer[i];
            if (encoding === "windows-1252" && byte >= 0x80 && windows1252Map[byte]) {
                result += windows1252Map[byte];
            } else {
                result += String.fromCharCode(byte);
            }
        }
        return result;
    }

    /**
     * Codifica string para single-byte encoding
     * Retorna o buffer e lista de caracteres nao suportados
     */
    private encodeSingleByte(text: string, encoding: string): { buffer: Buffer; unsupportedChars: string[] } {
        // Mapeamento COMPLETO Unicode -> Windows-1252 (usando escapes Unicode)
        const toWindows1252: Record<string, number> = {
            // Range 0x80-0x9F (caracteres especiais do Windows-1252)
            "\u20AC": 0x80, "\u201A": 0x82, "\u0192": 0x83, "\u201E": 0x84, "\u2026": 0x85,
            "\u2020": 0x86, "\u2021": 0x87, "\u02C6": 0x88, "\u2030": 0x89, "\u0160": 0x8A,
            "\u2039": 0x8B, "\u0152": 0x8C, "\u017D": 0x8E, "\u2018": 0x91, "\u2019": 0x92,
            "\u201C": 0x93, "\u201D": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97,
            "\u02DC": 0x98, "\u2122": 0x99, "\u0161": 0x9A, "\u203A": 0x9B, "\u0153": 0x9C,
            "\u017E": 0x9E, "\u0178": 0x9F,
            
            // Range 0xA0-0xBF
            "\u00A0": 0xA0, "\u00A1": 0xA1, "\u00A2": 0xA2, "\u00A3": 0xA3, "\u00A4": 0xA4,
            "\u00A5": 0xA5, "\u00A6": 0xA6, "\u00A7": 0xA7, "\u00A8": 0xA8, "\u00A9": 0xA9,
            "\u00AA": 0xAA, "\u00AB": 0xAB, "\u00AC": 0xAC, "\u00AD": 0xAD, "\u00AE": 0xAE,
            "\u00AF": 0xAF, "\u00B0": 0xB0, "\u00B1": 0xB1, "\u00B2": 0xB2, "\u00B3": 0xB3,
            "\u00B4": 0xB4, "\u00B5": 0xB5, "\u00B6": 0xB6, "\u00B7": 0xB7, "\u00B8": 0xB8,
            "\u00B9": 0xB9, "\u00BA": 0xBA, "\u00BB": 0xBB, "\u00BC": 0xBC, "\u00BD": 0xBD,
            "\u00BE": 0xBE, "\u00BF": 0xBF,
            
            // Letras maiusculas acentuadas (0xC0-0xDF)
            "\u00C0": 0xC0, "\u00C1": 0xC1, "\u00C2": 0xC2, "\u00C3": 0xC3, "\u00C4": 0xC4,
            "\u00C5": 0xC5, "\u00C6": 0xC6, "\u00C7": 0xC7, "\u00C8": 0xC8, "\u00C9": 0xC9,
            "\u00CA": 0xCA, "\u00CB": 0xCB, "\u00CC": 0xCC, "\u00CD": 0xCD, "\u00CE": 0xCE,
            "\u00CF": 0xCF, "\u00D0": 0xD0, "\u00D1": 0xD1, "\u00D2": 0xD2, "\u00D3": 0xD3,
            "\u00D4": 0xD4, "\u00D5": 0xD5, "\u00D6": 0xD6, "\u00D7": 0xD7, "\u00D8": 0xD8,
            "\u00D9": 0xD9, "\u00DA": 0xDA, "\u00DB": 0xDB, "\u00DC": 0xDC, "\u00DD": 0xDD,
            "\u00DE": 0xDE, "\u00DF": 0xDF,
            
            // Letras minusculas acentuadas (0xE0-0xFF)
            "\u00E0": 0xE0, "\u00E1": 0xE1, "\u00E2": 0xE2, "\u00E3": 0xE3, "\u00E4": 0xE4,
            "\u00E5": 0xE5, "\u00E6": 0xE6, "\u00E7": 0xE7, "\u00E8": 0xE8, "\u00E9": 0xE9,
            "\u00EA": 0xEA, "\u00EB": 0xEB, "\u00EC": 0xEC, "\u00ED": 0xED, "\u00EE": 0xEE,
            "\u00EF": 0xEF, "\u00F0": 0xF0, "\u00F1": 0xF1, "\u00F2": 0xF2, "\u00F3": 0xF3,
            "\u00F4": 0xF4, "\u00F5": 0xF5, "\u00F6": 0xF6, "\u00F7": 0xF7, "\u00F8": 0xF8,
            "\u00F9": 0xF9, "\u00FA": 0xFA, "\u00FB": 0xFB, "\u00FC": 0xFC, "\u00FD": 0xFD,
            "\u00FE": 0xFE, "\u00FF": 0xFF,
        };

        const bytes: number[] = [];
        const unsupportedChars: string[] = [];
        
        for (const char of text) {
            const code = char.charCodeAt(0);
            
            if (code < 128) {
                // ASCII direto
                bytes.push(code);
            } else if (encoding === "windows-1252" && toWindows1252[char] !== undefined) {
                bytes.push(toWindows1252[char]);
            } else if (encoding === "iso-8859-1" && code >= 0xA0 && code <= 0xFF) {
                // ISO-8859-1 suporta diretamente 0xA0-0xFF
                bytes.push(code);
            } else {
                // Caractere nao suportado no encoding
                unsupportedChars.push(char);
                bytes.push(0x3F); // ?
            }
        }

        return { buffer: Buffer.from(bytes), unsupportedChars };
    }

    /**
     * Lista arquivos de texto em um diretorio
     */
    async findTextFiles(dir: string, extensions: string[] = [".java", ".xml", ".properties", ".txt", ".jsp", ".html", ".js", ".css"]): Promise<string[]> {
        const results: string[] = [];

        const scan = async (currentDir: string) => {
            try {
                const entries = await fs.readdir(currentDir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    
                    if (entry.isDirectory()) {
                        // Ignora diretorios comuns de build
                        if (["node_modules", "target", "build", ".git", ".xavva", "dist", "bin"].includes(entry.name)) {
                            continue;
                        }
                        await scan(fullPath);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (extensions.includes(ext)) {
                            results.push(fullPath);
                        }
                    }
                }
            } catch (e) {
                // ignora diretorios sem permissao
            }
        };

        await scan(dir);
        return results;
    }

    /**
     * Converte todos os arquivos de um diretorio
     */
    async convertDirectory(
        dir: string,
        fromEncoding: string,
        toEncoding: string,
        options: { 
            backup?: boolean; 
            dryRun?: boolean;
            extensions?: string[];
        } = {}
    ): Promise<{ success: number; failed: number; total: number; totalUnsupported: number }> {
        const files = await this.findTextFiles(dir, options.extensions);
        let success = 0;
        let failed = 0;
        let totalUnsupported = 0;

        Logger.info("Arquivos encontrados", String(files.length));

        for (const file of files) {
            const result = await this.convertFile(file, fromEncoding, toEncoding, {
                backup: options.backup,
                dryRun: options.dryRun
            });

            if (result.success) {
                success++;
                if (result.unsupportedChars) {
                    totalUnsupported += result.unsupportedChars.length;
                }
                if (!options.dryRun) {
                    Logger.success(`${path.relative(dir, file)}: ${result.message}`);
                } else {
                    Logger.info(`${path.relative(dir, file)}`, result.message);
                }
            } else {
                failed++;
                Logger.warn(`${path.relative(dir, file)}: ${result.message}`);
            }
        }

        return { success, failed, total: files.length, totalUnsupported };
    }

    /**
     * Detecta encoding de todos os arquivos em um diretorio
     */
    async detectDirectoryEncodings(dir: string): Promise<Map<string, DetectedEncoding>> {
        const files = await this.findTextFiles(dir);
        const results = new Map<string, DetectedEncoding>();

        for (const file of files) {
            const detection = await this.detectFileEncoding(file);
            if (detection) {
                results.set(file, detection);
            }
        }

        return results;
    }
}
