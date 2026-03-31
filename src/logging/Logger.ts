/**
 * Logger principal do XAVVA CLI
 * Sistema unificado de logging com suporte a hierarquia, rate limiting e múltiplos formatos
 */

import type { LogLevel, LogEntry, LoggerConfig, LogContext, RateLimitEntry } from './types';
import { Colors, colorize, Icons, getIcon, supportsColor, visualWidth, padText, stripAnsi } from './colors';
import { 
  DEFAULT_CONFIG, 
  LOG_LEVELS, 
  LEVEL_COLORS, 
  LEVEL_ICONS,
  LAYOUT,
  NOISE_PATTERNS,
  ESSENTIAL_PATTERNS,
  SPINNER_FRAMES,
  SPINNER_INTERVAL
} from './constants';
import { formatEntry, formatStatusLine, formatSection, formatConfig, formatUrl, formatFile } from './formatters';

export class Logger {
  private static instance: Logger;
  private loggerConfig: LoggerConfig;
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();
  private groupStack: string[] = [];
  private spinners: Map<string, { timer: Timer; stop: () => void }> = new Map();
  
  // Cache de contexto para reutilização
  private currentTraceId: string | null = null;

  private constructor(config: Partial<LoggerConfig> = {}) {
    this.loggerConfig = { ...DEFAULT_CONFIG, ...config };
    
    // Detecta suporte a cores automaticamente
    if (!supportsColor()) {
      this.loggerConfig.colors = false;
    }
    
    // Limpa rate limit periodicamente
    setInterval(() => this.cleanupRateLimit(), 60000);
  }

  /**
   * Obtém instância singleton do Logger
   */
  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Reinicia a instância (útil para testes)
   */
  static reset(): void {
    Logger.instance = new Logger();
  }

  /**
   * Configura o logger
   */
  configure(config: Partial<LoggerConfig>): void {
    this.loggerConfig = { ...this.loggerConfig, ...config };
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): LoggerConfig {
    return { ...this.loggerConfig };
  }

  /**
   * Define nível de log
   */
  setLevel(level: LogLevel): void {
    this.loggerConfig.level = level;
  }

  /**
   * Define modo de saída
   */
  setMode(mode: LoggerConfig['mode']): void {
    this.loggerConfig.mode = mode;
  }

  /**
   * Verifica se um nível deve ser logado
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.loggerConfig.level];
  }

  /**
   * Verifica rate limiting
   */
  private checkRateLimit(message: string): boolean {
    const now = Date.now();
    const plainMessage = stripAnsi(message);
    const existing = this.rateLimitMap.get(plainMessage);
    
    if (existing) {
      // Verifica se está dentro da janela de rate limit
      if (now - existing.firstSeen < this.loggerConfig.rateLimitWindowMs) {
        existing.count++;
        existing.lastSeen = now;
        
        // Se excedeu o limite, suprime o log
        if (existing.count > this.loggerConfig.maxDuplicateLogs) {
          return false;
        }
      } else {
        // Reseta o contador se passou da janela
        existing.count = 1;
        existing.firstSeen = now;
        existing.lastSeen = now;
      }
    } else {
      // Primeira ocorrência
      this.rateLimitMap.set(plainMessage, {
        message: plainMessage,
        count: 1,
        firstSeen: now,
        lastSeen: now,
      });
    }
    
    return true;
  }

  /**
   * Limpa entradas antigas do rate limit
   */
  private cleanupRateLimit(): void {
    const now = Date.now();
    for (const [key, entry] of this.rateLimitMap) {
      if (now - entry.lastSeen > this.loggerConfig.rateLimitWindowMs * 2) {
        // Se foi suprimido, mostra resumo
        if (entry.count > this.loggerConfig.maxDuplicateLogs) {
          const suppressed = entry.count - this.loggerConfig.maxDuplicateLogs;
          this.write({
            level: 'debug',
            message: `${Colors.gray}(mensagem repetida ${suppressed}x e suprimida)${Colors.reset}`,
            timestamp: new Date(),
          });
        }
        this.rateLimitMap.delete(key);
      }
    }
  }

  /**
   * Gera um trace ID único
   */
  generateTraceId(): string {
    const id = Math.random().toString(36).substring(2, 8);
    this.currentTraceId = id;
    return id;
  }

  /**
   * Define trace ID atual
   */
  setTraceId(id: string | null): void {
    this.currentTraceId = id;
  }

  /**
   * Obtém trace ID atual
   */
  getTraceId(): string | null {
    return this.currentTraceId;
  }

  /**
   * Cria contexto de log
   */
  private createContext(extra?: Partial<LogContext>): LogContext {
    return {
      traceId: this.currentTraceId || undefined,
      indent: this.groupStack.length,
      ...extra,
    };
  }

  /**
   * Escreve uma entrada de log
   */
  private write(entry: LogEntry): void {
    if (this.loggerConfig.mode === 'silent') return;
    
    const formatted = formatEntry(entry, this.loggerConfig);
    if (!formatted) return;
    
    // Usa console.log ou console.error conforme o nível
    if (entry.level === 'error') {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Log genérico
   */
  log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    if (!this.checkRateLimit(message)) return;
    
    this.write({
      level,
      message,
      timestamp: new Date(),
      context: this.createContext(),
      metadata,
    });
  }

  // ========== Métodos de conveniência por nível ==========

  error(message: string, metadata?: Record<string, unknown>): void {
    const icon = this.loggerConfig.icons ? `${Icons.error} ` : '';
    const color = this.loggerConfig.colors ? Colors.error : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    this.log('error', `${color}${icon}${message}${reset}`, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    const icon = this.loggerConfig.icons ? `${Icons.warning} ` : '';
    const color = this.loggerConfig.colors ? Colors.warning : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    this.log('warn', `${color}${icon}${message}${reset}`, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    const icon = this.loggerConfig.icons ? `${Icons.info} ` : '';
    const color = this.loggerConfig.colors ? Colors.info : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    this.log('info', `${color}${icon}${message}${reset}`, metadata);
  }

  success(message: string, metadata?: Record<string, unknown>): void {
    const icon = this.loggerConfig.icons ? `${Icons.success} ` : '';
    const color = this.loggerConfig.colors ? Colors.success : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    this.log('success', `${color}${icon}${message}${reset}`, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    const icon = this.loggerConfig.icons ? `${Icons.bullet} ` : '';
    const color = this.loggerConfig.colors ? Colors.gray : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    this.log('debug', `${color}${icon}${message}${reset}`, metadata);
  }

  trace(message: string, metadata?: Record<string, unknown>): void {
    const icon = this.loggerConfig.icons ? `${Icons.circle} ` : '';
    const color = this.loggerConfig.colors ? Colors.darkGray : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    this.log('trace', `${color}${icon}${message}${reset}`, metadata);
  }

  silly(message: string, metadata?: Record<string, unknown>): void {
    const color = this.loggerConfig.colors ? Colors.darkGray : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    this.log('silly', `${color}${message}${reset}`, metadata);
  }

  // ========== Métodos de formatação específica ==========

  /**
   * Log de status (nome, status, info)
   */
  status(
    name: string,
    status: 'pending' | 'running' | 'success' | 'error' | 'warning',
    info?: string
  ): void {
    if (!this.shouldLog('info')) return;
    
    const line = formatStatusLine(name, status, info, this.loggerConfig);
    this.write({
      level: status === 'error' ? 'error' : 'info',
      message: line,
      timestamp: new Date(),
      context: this.createContext(),
    });
  }

  /**
   * Log de seção
   */
  section(title: string): void {
    if (!this.shouldLog('info')) return;
    
    const formatted = formatSection(title, this.loggerConfig);
    this.write({
      level: 'info',
      message: formatted,
      timestamp: new Date(),
      context: this.createContext(),
    });
  }

  /**
   * Log de configuração
   */
  config(key: string, value: string | number | boolean): void {
    if (!this.shouldLog('info')) return;
    
    const formatted = formatConfig(key, value, this.loggerConfig);
    this.write({
      level: 'info',
      message: formatted,
      timestamp: new Date(),
      context: this.createContext(),
    });
  }

  /**
   * Log de URL
   */
  url(label: string, url: string): void {
    if (!this.shouldLog('info')) return;
    
    const formatted = formatUrl(label, url, this.loggerConfig);
    this.write({
      level: 'info',
      message: formatted,
      timestamp: new Date(),
      context: this.createContext(),
    });
  }

  /**
   * Log de arquivo
   */
  file(name: string, action: 'changed' | 'compiled' | 'synced' | 'error', path?: string): void {
    if (!this.shouldLog('info')) return;
    
    const formatted = formatFile(name, action, path, this.loggerConfig);
    this.write({
      level: action === 'error' ? 'error' : 'info',
      message: formatted,
      timestamp: new Date(),
      context: this.createContext(),
    });
  }

  /**
   * Log de pronto/concluído
   */
  ready(message: string): void {
    const icon = this.loggerConfig.icons ? `${Icons.success} ` : '';
    const color = this.loggerConfig.colors ? Colors.success : '';
    const bold = this.loggerConfig.colors ? Colors.bold : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    this.success(`${color}${icon}${bold}${message}${reset}`);
  }

  /**
   * Log de passo/etapa
   */
  step(message: string): void {
    const icon = this.loggerConfig.icons ? `${Icons.arrow} ` : '';
    const color = this.loggerConfig.colors ? Colors.gray : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    this.info(`${color}${icon}${message}${reset}`);
  }

  /**
   * Log de divisão
   */
  divider(): void {
    const indent = ' '.repeat(LAYOUT.indentSize);
    const line = this.loggerConfig.colors 
      ? `${Colors.darkGray}${LAYOUT.borders.horizontal.repeat(60)}${Colors.reset}`
      : '-'.repeat(60);
    this.write({
      level: 'info',
      message: `${indent}${line}`,
      timestamp: new Date(),
      context: this.createContext(),
    });
  }

  /**
   * Nova linha
   */
  newline(): void {
    console.log();
  }

  // ========== Grupos hierárquicos ==========

  /**
   * Inicia um grupo de logs
   */
  group(label: string): void {
    if (!this.shouldLog('info')) return;
    
    const indent = this.groupStack.length * LAYOUT.indentSize;
    const icon = this.loggerConfig.icons ? '▶ ' : '';
    const color = this.loggerConfig.colors ? Colors.bold : '';
    const reset = this.loggerConfig.colors ? Colors.reset : '';
    
    this.write({
      level: 'info',
      message: `${' '.repeat(indent)}${color}${icon}${label}${reset}`,
      timestamp: new Date(),
      context: this.createContext(),
    });
    
    this.groupStack.push(label);
  }

  /**
   * Encerra um grupo
   */
  groupEnd(): void {
    this.groupStack.pop();
  }

  /**
   * Executa função dentro de um grupo
   */
  async withGroup<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.group(label);
    try {
      return await fn();
    } finally {
      this.groupEnd();
    }
  }

  // ========== Spinner / Loading ==========

  /**
   * Cria um spinner
   */
  spinner(message: string): { stop: (success?: boolean) => void; update: (msg: string) => void } {
    if (this.loggerConfig.mode === 'silent' || this.loggerConfig.mode === 'minimal') {
      return { 
        stop: () => {}, 
        update: () => {} 
      };
    }
    
    const id = Math.random().toString(36).substring(2, 8);
    const frames = SPINNER_FRAMES.default;
    let frameIndex = 0;
    
    // Para cursor
    process.stdout.write('\x1B[?25l');
    
    const render = (msg: string) => {
      const frame = frames[frameIndex];
      const color = this.loggerConfig.colors ? Colors.primary : '';
      const dim = this.loggerConfig.colors ? Colors.dim : '';
      const reset = this.loggerConfig.colors ? Colors.reset : '';
      const indent = this.groupStack.length * LAYOUT.indentSize;
      
      const line = `${' '.repeat(indent)}${color}${frame}${reset} ${dim}${msg}${reset}`;
      process.stdout.write(`\r${line}`);
      
      frameIndex = (frameIndex + 1) % frames.length;
    };
    
    render(message);
    
    const timer = setInterval(() => render(message), SPINNER_INTERVAL);
    
    const stop = (success = true) => {
      clearInterval(timer);
      this.spinners.delete(id);
      
      const icon = success ? Icons.success : Icons.error;
      const color = success 
        ? (this.loggerConfig.colors ? Colors.success : '')
        : (this.loggerConfig.colors ? Colors.error : '');
      const reset = this.loggerConfig.colors ? Colors.reset : '';
      const indent = this.groupStack.length * LAYOUT.indentSize;
      
      // Limpa a linha e escreve o resultado
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      console.log(`${' '.repeat(indent)}${color}${icon}${reset} ${message}`);
      
      // Restaura cursor
      process.stdout.write('\x1B[?25h');
    };
    
    const update = (msg: string) => {
      message = msg;
    };
    
    this.spinners.set(id, { timer, stop });
    
    return { stop, update };
  }

  /**
   * Para todos os spinners ativos
   */
  stopAllSpinners(success = false): void {
    for (const [, spinner] of this.spinners) {
      spinner.stop();
    }
    this.spinners.clear();
    process.stdout.write('\x1B[?25h');
  }

  // ========== Métodos estáticos para conveniência ==========

  static error(message: string, metadata?: Record<string, unknown>): void {
    Logger.getInstance().error(message, metadata);
  }

  static warn(message: string, metadata?: Record<string, unknown>): void {
    Logger.getInstance().warn(message, metadata);
  }

  static info(message: string, metadata?: Record<string, unknown>): void {
    Logger.getInstance().info(message, metadata);
  }

  static success(message: string, metadata?: Record<string, unknown>): void {
    Logger.getInstance().success(message, metadata);
  }

  static debug(message: string, metadata?: Record<string, unknown>): void {
    Logger.getInstance().debug(message, metadata);
  }

  static trace(message: string, metadata?: Record<string, unknown>): void {
    Logger.getInstance().trace(message, metadata);
  }

  static silly(message: string, metadata?: Record<string, unknown>): void {
    Logger.getInstance().silly(message, metadata);
  }
}

// Exporta instância padrão
export const logger = Logger.getInstance();
