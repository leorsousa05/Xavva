import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { EncodingService } from "../services/EncodingService";
import { Logger, C } from "../utils/ui";
import path from "path";
import { existsSync } from "fs";
import { ProcessManager } from "../utils/processManager";

export class EncodingCommand implements Command {
    private encodingService: EncodingService;

    constructor() {
        this.encodingService = new EncodingService();
    }

    async execute(config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        const processManager = ProcessManager.getInstance();
        
        // Mostra help se solicitado
        if (args?.help) {
            this.showHelp();
            await processManager.shutdown(0);
            return;
        }

        // Parse subcomando
        const subcommand = positionals?.[1] || "help";
        const fileArg = positionals?.[2]; // Arquivo específico (opcional)

        switch (subcommand) {
            case "detect":
                await this.handleDetect(fileArg);
                break;
            case "convert":
                await this.handleConvert(config, args, fileArg);
                break;
            case "fix":
                await this.handleFix(fileArg, args);
                break;
            case "list":
                await this.handleList(config);
                break;
            case "help":
            default:
                this.showHelp();
                break;
        }

        await processManager.shutdown(0);
    }

    private showHelp() {
        Logger.section("Encoding Command");
        Logger.log("Gerencia conversão de encoding de arquivos de texto");
        Logger.newline();
        
        Logger.log(`${C.primary}Uso:${C.reset}`);
        Logger.log("  xavva encoding <subcomando> [arquivo] [opções]");
        Logger.newline();
        
        Logger.log(`${C.primary}Subcomandos:${C.reset}`);
        Logger.log(`  ${C.secondary}detect${C.reset} [arquivo]          Detecta encoding de um arquivo ou diretório`);
        Logger.log(`  ${C.secondary}convert${C.reset} [arquivo]          Converte arquivo(s) para outro encoding`);
        Logger.log(`  ${C.secondary}fix${C.reset} [arquivo]              Tenta corrigir mojibake automaticamente`);
        Logger.log(`  ${C.secondary}list${C.reset}                     Lista encodings de todos os arquivos do projeto`);
        Logger.log(`  ${C.secondary}help${C.reset}                     Mostra esta ajuda`);
        Logger.newline();
        
        Logger.log(`${C.primary}Opções:${C.reset}`);
        Logger.log(`  --from <encoding>      Encoding de origem (padrão: auto-detect)`);
        Logger.log(`  --to <encoding>        Encoding de destino (padrão: do xavva.json ou UTF-8)`);
        Logger.log(`  --backup               Cria backup antes de converter`);
        Logger.log(`  --dry-run              Simula sem modificar arquivos`);
        Logger.log(`  --force                Força correção mesmo se detectado como UTF-8`);
        Logger.log(`  --src <path>           Diretório fonte (padrão: src/)`);
        Logger.newline();
        
        Logger.log(`${C.primary}Encodings suportados:${C.reset}`);
        Logger.log(`  utf-8, utf8            UTF-8 (padrão)`);
        Logger.log(`  windows-1252, cp1252   Windows CP1252 (ANSI)`);
        Logger.log(`  iso-8859-1, latin1     ISO-8859-1 (Latin-1)`);
        Logger.newline();
        
        Logger.log(`${C.primary}Exemplos:${C.reset}`);
        Logger.log(`  xavva encoding detect src/main/java/MinhaClasse.java`);
        Logger.log(`  xavva encoding convert --from utf-8 --to cp1252 src/main/java/`);
        Logger.log(`  xavva encoding convert --to cp1252 --backup src/main/java/MinhaClasse.java`);
        Logger.log(`  xavva encoding fix src/main/java/MinhaClasse.java`);
        Logger.log(`  xavva encoding fix --force src/main/java/MinhaClasse.java  # Força correção`);
        Logger.log(`  xavva encoding list`);
        Logger.endSection();
    }

    private async handleDetect(fileArg?: string) {
        const target = fileArg || path.join(process.cwd(), "src");

        if (!existsSync(target)) {
            Logger.error(`Caminho não encontrado: ${target}`);
            return;
        }

        Logger.section("Detecção de Encoding");
        Logger.info("Alvo", target);
        Logger.newline();

        const stat = await Bun.file(target).stat();
        
        if (stat.isFile()) {
            // Detectar arquivo único
            const detection = await this.encodingService.detectFileEncoding(target);
            if (detection) {
                Logger.info("Arquivo", path.basename(target));
                Logger.config("Encoding detectado", detection.encoding);
                Logger.config("Confiança", `${Math.round(detection.confidence * 100)}%`);
                Logger.config("Tem BOM", detection.hasBOM ? "Sim" : "Não");
            } else {
                Logger.error("Não foi possível detectar o encoding");
            }
        } else {
            // Detectar diretório
            const detections = await this.encodingService.detectDirectoryEncodings(target);
            
            if (detections.size === 0) {
                Logger.warn("Nenhum arquivo de texto encontrado");
                return;
            }

            // Agrupa por encoding
            const byEncoding = new Map<string, number>();
            for (const [file, detection] of detections) {
                const count = byEncoding.get(detection.encoding) || 0;
                byEncoding.set(detection.encoding, count + 1);
            }

            Logger.info("Arquivos analisados", String(detections.size));
            Logger.newline();

            Logger.log(`${C.primary}Distribuição por encoding:${C.reset}`);
            for (const [encoding, count] of byEncoding) {
                Logger.config(encoding, `${count} arquivo(s)`);
            }

            Logger.newline();
            Logger.log(`${C.primary}Arquivos com baixa confiança:${C.reset}`);
            let lowConfidenceFound = false;
            for (const [file, detection] of detections) {
                if (detection.confidence < 0.8) {
                    Logger.warn(`${path.relative(target, file)} (${Math.round(detection.confidence * 100)}%)`);
                    lowConfidenceFound = true;
                }
            }
            if (!lowConfidenceFound) {
                Logger.success("Todos os arquivos têm confiança alta na detecção");
            }
        }

        Logger.endSection();
    }

    private async handleConvert(config: AppConfig, args?: CLIArguments, fileArg?: string) {
        const fromEncoding = args?.["from"] as string || "auto";
        const toEncoding = args?.["to"] as string || config.project.encoding || "utf-8";
        const backup = args?.["backup"] as boolean || false;
        const dryRun = args?.["dry-run"] as boolean || false;
        const srcDir = args?.["src"] as string || path.join(process.cwd(), "src");

        const target = fileArg || srcDir;

        if (!existsSync(target)) {
            Logger.error(`Caminho não encontrado: ${target}`);
            return;
        }

        // Valida encoding de destino
        if (!this.encodingService.isValidEncoding(toEncoding)) {
            Logger.error(`Encoding não suportado: "${toEncoding}"`);
            Logger.info("Encodings suportados", this.encodingService.getSupportedEncodings().join(", "));
            return;
        }

        // Valida encoding de origem (se não for auto)
        if (fromEncoding !== "auto" && !this.encodingService.isValidEncoding(fromEncoding)) {
            Logger.error(`Encoding não suportado: "${fromEncoding}"`);
            Logger.info("Encodings suportados", this.encodingService.getSupportedEncodings().join(", "));
            return;
        }

        Logger.section("Conversão de Encoding");
        Logger.info("De", fromEncoding === "auto" ? "auto-detect" : fromEncoding);
        Logger.info("Para", toEncoding);
        Logger.info("Alvo", target);
        if (backup) Logger.config("Backup", "Sim");
        if (dryRun) Logger.config("Modo", "DRY RUN (simulação)");
        Logger.newline();

        const stat = await Bun.file(target).stat();

        if (stat.isFile()) {
            // Converter arquivo único
            let actualFrom = fromEncoding;
            
            if (fromEncoding === "auto") {
                const detection = await this.encodingService.detectFileEncoding(target);
                if (detection) {
                    actualFrom = detection.encoding;
                    Logger.info("Detectado", `${actualFrom} (${Math.round(detection.confidence * 100)}%)`);
                } else {
                    Logger.error("Não foi possível detectar encoding. Use --from para especificar.");
                    return;
                }
            }

            const result = await this.encodingService.convertFile(target, actualFrom, toEncoding, {
                backup,
                dryRun
            });

            if (result.success) {
                Logger.success(result.message);
                if (result.unsupportedChars && result.unsupportedChars.length > 0) {
                    const unique = [...new Set(result.unsupportedChars)].slice(0, 5);
                    const codes = unique.map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
                    Logger.warn(`${result.unsupportedChars.length} caractere(s) não suportado(s): ${codes.join(", ")}`);
                    Logger.info("Dica", "Caracteres não suportados foram substituídos por '?'");
                }
            } else {
                Logger.error(result.message);
            }
        } else {
            // Converter diretório
            let actualFrom = fromEncoding;
            
            if (fromEncoding === "auto") {
                Logger.warn("Modo auto-detect em diretórios assume UTF-8 ou detecta individualmente");
                actualFrom = "utf-8"; // Default para diretórios em auto
            }

            const result = await this.encodingService.convertDirectory(target, actualFrom, toEncoding, {
                backup,
                dryRun
            });

            Logger.newline();
            Logger.info("Total", String(result.total));
            Logger.success(`Sucesso: ${result.success}`);
            if (result.failed > 0) {
                Logger.warn(`Falhas: ${result.failed}`);
            }
            if (result.totalUnsupported > 0) {
                Logger.warn(`${result.totalUnsupported} caractere(s) substituído(s) por "?"`);
            }
        }

        Logger.endSection();
    }

    private async handleFix(fileArg?: string, args?: CLIArguments) {
        const backup = args?.["backup"] as boolean || false;
        const dryRun = args?.["dry-run"] as boolean || false;
        const force = args?.["force"] as boolean || false;
        const target = fileArg || path.join(process.cwd(), "src");

        if (!existsSync(target)) {
            Logger.error(`Caminho não encontrado: ${target}`);
            return;
        }

        Logger.section("Correção de Mojibake");
        Logger.info("Alvo", target);
        if (backup) Logger.config("Backup", "Sim");
        if (dryRun) Logger.config("Modo", "DRY RUN (simulação)");
        Logger.newline();

        const stat = await Bun.file(target).stat();

        if (stat.isFile()) {
            const result = await this.encodingService.fixMojibake(target, { backup, dryRun, force });
            
            if (result.success) {
                Logger.success(result.message);
            } else {
                Logger.warn(result.message);
            }
        } else {
            // Fix em diretório
            const files = await this.encodingService.findTextFiles(target);
            let fixed = 0;
            let skipped = 0;
            let failed = 0;

            Logger.info("Arquivos encontrados", String(files.length));
            Logger.newline();

            for (const file of files) {
                const result = await this.encodingService.fixMojibake(file, { backup, dryRun, force });
                const relativePath = path.relative(target, file);

                if (result.success && result.detectedFrom !== "utf-8") {
                    Logger.success(`${relativePath}: ${result.message}`);
                    fixed++;
                } else if (result.detectedFrom === "utf-8") {
                    // Já está em UTF-8, não mostra nada em modo silencioso
                    skipped++;
                } else {
                    Logger.warn(`${relativePath}: ${result.message}`);
                    failed++;
                }
            }

            Logger.newline();
            Logger.info("Corrigidos", String(fixed));
            Logger.info("Já em UTF-8", String(skipped));
            if (failed > 0) Logger.warn(`Não corrigidos: ${failed}`);
        }

        Logger.endSection();
    }

    private async handleList(config: AppConfig) {
        const srcDir = path.join(process.cwd(), "src");
        
        if (!existsSync(srcDir)) {
            Logger.error(`Diretório src/ não encontrado`);
            return;
        }

        Logger.section("Lista de Encodings");
        Logger.info("Diretório", srcDir);
        Logger.info("Encoding padrão", config.project.encoding || "utf-8 (padrão)");
        Logger.newline();

        const detections = await this.encodingService.detectDirectoryEncodings(srcDir);
        
        if (detections.size === 0) {
            Logger.warn("Nenhum arquivo de texto encontrado");
            return;
        }

        // Ordena arquivos
        const sortedFiles = Array.from(detections.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        Logger.log(`${C.primary}Arquivos:${C.reset}`);
        for (const [file, detection] of sortedFiles) {
            const relativePath = path.relative(srcDir, file);
            const confidenceStr = detection.confidence >= 0.9 ? "" : 
                ` ${C.gray}(${Math.round(detection.confidence * 100)}%)${C.reset}`;
            const bomStr = detection.hasBOM ? ` ${C.warning}[BOM]${C.reset}` : "";
            
            const encodingColor = detection.encoding === (config.project.encoding || "utf-8") 
                ? C.success 
                : C.warning;
            
            Logger.log(`  ${encodingColor}${detection.encoding.padEnd(12)}${C.reset} ${relativePath}${confidenceStr}${bomStr}`);
        }

        Logger.endSection();
    }
}
