/**
 * Comando Clean - Limpa cache, builds e logs
 * 
 * Uso:
 *   xavva clean           # limpa tudo
 *   xavva clean --cache   # só cache
 *   xavva clean --build   # só target/build
 *   xavva clean --logs    # só logs do Tomcat
 *   xavva clean --tomcat  # só work do Tomcat
 */

import { rm, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../logging";
import { PATHS } from "../config/versions";

interface CleanOptions {
    all: boolean;
    cache: boolean;
    build: boolean;
    logs: boolean;
    tomcat: boolean;
}

interface CleanResult {
    cleaned: string[];
    failed: Array<{ path: string; error: string }>;
    bytesFreed: number;
}

export class CleanCommand implements Command {
    private logger = Logger.getInstance();

    async execute(config: AppConfig, args: CLIArguments): Promise<void> {
        const options = this.parseOptions(args);
        
        this.logger.section("LIMPEZA");
        
        const result: CleanResult = {
            cleaned: [],
            failed: [],
            bytesFreed: 0,
        };

        // Limpa cache
        if (options.cache || options.all) {
            await this.cleanCache(result);
        }

        // Limpa build
        if (options.build || options.all) {
            await this.cleanBuild(result, config);
        }

        // Limpa logs
        if (options.logs || options.all) {
            await this.cleanLogs(result, config);
        }

        // Limpa Tomcat work
        if (options.tomcat || options.all) {
            await this.cleanTomcatWork(result, config);
        }

        this.printSummary(result);
    }

    private parseOptions(args: CLIArguments): CleanOptions {
        const hasSpecific = args.cache || args.build || args.logs || (args as any).tomcat;
        
        return {
            all: !hasSpecific, // Se nenhum específico, limpa tudo
            cache: !!(args.cache || !hasSpecific),
            build: !!(args.build || !hasSpecific),
            logs: !!(args.logs || !hasSpecific),
            tomcat: !!((args as any).tomcat || !hasSpecific),
        };
    }

    private async cleanCache(result: CleanResult): Promise<void> {
        this.logger.step("Limpando cache...");
        
        const cacheDirs = [
            path.join(os.homedir(), '.xavva', 'cache'),
            path.join(os.homedir(), '.xavva', 'dependency-cache'),
            path.join(os.homedir(), '.xavva', 'build-cache'),
            path.join(process.cwd(), PATHS.XAVVA_DIR, 'cache'),
        ];

        for (const dir of cacheDirs) {
            if (existsSync(dir)) {
                try {
                    const size = await this.getDirectorySize(dir);
                    await rm(dir, { recursive: true, force: true });
                    result.cleaned.push(`cache: ${path.basename(dir)}`);
                    result.bytesFreed += size;
                } catch (e) {
                    result.failed.push({ path: dir, error: (e as Error).message });
                }
            }
        }
    }

    private async cleanBuild(result: CleanResult, config: AppConfig): Promise<void> {
        this.logger.step("Limpando diretórios de build...");
        
        const buildDirs = [
            path.join(process.cwd(), PATHS.TARGET_DIR),
            path.join(process.cwd(), PATHS.BUILD_DIR),
        ];

        for (const dir of buildDirs) {
            if (existsSync(dir)) {
                try {
                    const size = await this.getDirectorySize(dir);
                    await rm(dir, { recursive: true, force: true });
                    result.cleaned.push(`build: ${path.basename(dir)}`);
                    result.bytesFreed += size;
                } catch (e) {
                    result.failed.push({ path: dir, error: (e as Error).message });
                }
            }
        }
    }

    private async cleanLogs(result: CleanResult, config: AppConfig): Promise<void> {
        this.logger.step("Limpando logs...");
        
        const logDirs = [
            path.join(config.tomcat.path, "logs"),
            path.join(process.cwd(), PATHS.XAVVA_DIR, "logs"),
        ];

        for (const dir of logDirs) {
            if (existsSync(dir)) {
                try {
                    const files = await readdir(dir);
                    let dirSize = 0;
                    
                    for (const file of files) {
                        if (file.endsWith('.log') || file.endsWith('.txt')) {
                            const filePath = path.join(dir, file);
                            const stats = await Bun.file(filePath).stat();
                            dirSize += stats.size;
                            await rm(filePath);
                        }
                    }
                    
                    result.cleaned.push(`logs: ${path.basename(dir)} (${files.length} arquivos)`);
                    result.bytesFreed += dirSize;
                } catch (e) {
                    result.failed.push({ path: dir, error: (e as Error).message });
                }
            }
        }
    }

    private async cleanTomcatWork(result: CleanResult, config: AppConfig): Promise<void> {
        this.logger.step("Limpando work do Tomcat...");
        
        const workDirs = [
            path.join(config.tomcat.path, "work"),
            path.join(config.tomcat.path, "temp"),
            path.join(config.tomcat.path, PATHS.WEBAPP_DIR),
        ];

        for (const dir of workDirs) {
            if (existsSync(dir)) {
                try {
                    const size = await this.getDirectorySize(dir);
                    await rm(dir, { recursive: true, force: true });
                    result.cleaned.push(`tomcat: ${path.basename(dir)}`);
                    result.bytesFreed += size;
                } catch (e) {
                    result.failed.push({ path: dir, error: (e as Error).message });
                }
            }
        }
    }

    private async getDirectorySize(dir: string): Promise<number> {
        let total = 0;
        
        try {
            const files = await readdir(dir, { withFileTypes: true });
            
            for (const file of files) {
                const filePath = path.join(dir, file.name);
                
                if (file.isDirectory()) {
                    total += await this.getDirectorySize(filePath);
                } else {
                    const stats = await Bun.file(filePath).stat();
                    total += stats.size;
                }
            }
        } catch {
            // Ignora erros
        }
        
        return total;
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return "0 B";
        
        const units = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
    }

    private printSummary(result: CleanResult): void {
        this.logger.newline();
        this.logger.divider();
        
        if (result.cleaned.length > 0) {
            this.logger.success(`${result.cleaned.length} item(ns) limpo(s)`);
            for (const item of result.cleaned) {
                this.logger.info(`  ✓ ${item}`);
            }
        }
        
        if (result.failed.length > 0) {
            this.logger.warn(`${result.failed.length} falha(s)`);
            for (const item of result.failed) {
                this.logger.error(`  ✗ ${path.basename(item.path)}: ${item.error}`);
            }
        }
        
        this.logger.divider();
        this.logger.info(`Espaço liberado: ${this.formatBytes(result.bytesFreed)}`);
        
        if (result.cleaned.length === 0 && result.failed.length === 0) {
            this.logger.info("Nada para limpar - já está tudo organizado!");
        }
    }
}
