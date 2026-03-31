/**
 * FileLogger - Persistência de logs em arquivo
 * 
 * Salva logs em formato JSON Lines (.jsonl) para fácil integração
 * com ferramentas de análise como ELK, Datadog, etc.
 * 
 * Características:
 * - Rotação automática por data
 * - Limite de tamanho por arquivo
 * - Limite de arquivos retidos
 * - Formato estruturado (JSON)
 */

import { existsSync, mkdirSync, appendFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { LogEntry } from './types';
import { FILE_LOG } from './constants';

export interface FileLoggerOptions {
  logDir: string;
  maxFiles: number;
  maxSize: number;
  enabled: boolean;
}

export class FileLogger {
  private options: FileLoggerOptions;
  private currentFile: string | null = null;
  private currentSize = 0;
  private initialized = false;

  constructor(options: Partial<FileLoggerOptions> = {}) {
    this.options = {
      logDir: '.xavva/logs',
      maxFiles: FILE_LOG.maxFiles,
      maxSize: FILE_LOG.maxSize,
      enabled: true,
      ...options,
    };
  }

  /**
   * Inicializa o diretório de logs
   */
  private initialize(): void {
    if (this.initialized || !this.options.enabled) return;
    
    try {
      if (!existsSync(this.options.logDir)) {
        mkdirSync(this.options.logDir, { recursive: true });
      }
      this.initialized = true;
    } catch (error) {
      console.error('Falha ao inicializar diretório de logs:', error);
      this.options.enabled = false;
    }
  }

  /**
   * Obtém o nome do arquivo de log atual
   */
  private getCurrentFileName(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return join(this.options.logDir, `xavva-${year}-${month}-${day}.jsonl`);
  }

  /**
   * Verifica se precisa rotacionar para novo arquivo
   */
  private checkRotation(): void {
    const newFile = this.getCurrentFileName();
    
    if (this.currentFile !== newFile) {
      // Mudou de dia, atualiza arquivo
      this.currentFile = newFile;
      this.currentSize = existsSync(newFile) ? statSync(newFile).size : 0;
      this.cleanupOldFiles();
    } else if (this.currentFile && this.currentSize > this.options.maxSize) {
      // Arquivo muito grande, cria novo com sufixo
      const timestamp = Date.now();
      this.currentFile = this.currentFile.replace('.jsonl', `-${timestamp}.jsonl`);
      this.currentSize = 0;
    }
  }

  /**
   * Remove arquivos de log antigos
   */
  private cleanupOldFiles(): void {
    try {
      if (!existsSync(this.options.logDir)) return;
      
      const files = readdirSync(this.options.logDir)
        .filter(f => f.startsWith('xavva-') && f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: join(this.options.logDir, f),
          time: statSync(join(this.options.logDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time); // Mais recente primeiro
      
      // Remove arquivos excedentes
      const filesToRemove = files.slice(this.options.maxFiles);
      for (const file of filesToRemove) {
        try {
          unlinkSync(file.path);
        } catch {
          // Ignora erros de deleção
        }
      }
    } catch {
      // Ignora erros de cleanup
    }
  }

  /**
   * Escreve uma entrada de log no arquivo
   */
  write(entry: LogEntry): void {
    if (!this.options.enabled) return;
    
    this.initialize();
    this.checkRotation();
    
    if (!this.currentFile) return;
    
    try {
      // Formata como JSON Lines
      const logLine = JSON.stringify({
        timestamp: entry.timestamp.toISOString(),
        level: entry.level,
        message: entry.message.replace(/\x1b\[\d+m/g, ''), // Remove ANSI
        traceId: entry.context?.traceId,
        metadata: entry.metadata,
      }) + '\n';
      
      appendFileSync(this.currentFile, logLine);
      this.currentSize += Buffer.byteLength(logLine);
    } catch (error) {
      // Falha silenciosa - não deve quebrar a aplicação por causa de log em arquivo
      if (process.env.XAVVA_DEBUG) {
        console.error('Falha ao escrever log em arquivo:', error);
      }
    }
  }

  /**
   * Habilita/desabilita logging em arquivo
   */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
  }

  /**
   * Verifica se está habilitado
   */
  isEnabled(): boolean {
    return this.options.enabled;
  }

  /**
   * Obtém caminho do diretório de logs
   */
  getLogDir(): string {
    return this.options.logDir;
  }

  /**
   * Lista arquivos de log existentes
   */
  listLogFiles(): { name: string; path: string; size: number; modified: Date }[] {
    try {
      if (!existsSync(this.options.logDir)) return [];
      
      return readdirSync(this.options.logDir)
        .filter(f => f.startsWith('xavva-') && f.endsWith('.jsonl'))
        .map(f => {
          const path = join(this.options.logDir, f);
          const stats = statSync(path);
          return {
            name: f,
            path,
            size: stats.size,
            modified: stats.mtime,
          };
        })
        .sort((a, b) => b.modified.getTime() - a.modified.getTime());
    } catch {
      return [];
    }
  }

  /**
   * Limpa todos os arquivos de log
   */
  clearAll(): void {
    try {
      const files = this.listLogFiles();
      for (const file of files) {
        unlinkSync(file.path);
      }
      this.currentFile = null;
      this.currentSize = 0;
    } catch {
      // Ignora erros
    }
  }
}

// Instância global
let globalFileLogger: FileLogger | null = null;

/**
 * Obtém instância global do FileLogger
 */
export function getFileLogger(options?: Partial<FileLoggerOptions>): FileLogger {
  if (!globalFileLogger) {
    globalFileLogger = new FileLogger(options);
  }
  return globalFileLogger;
}

/**
 * Configura o FileLogger global
 */
export function configureFileLogger(options: Partial<FileLoggerOptions>): void {
  if (globalFileLogger) {
    globalFileLogger = new FileLogger({ ...globalFileLogger, ...options });
  } else {
    globalFileLogger = new FileLogger(options);
  }
}
