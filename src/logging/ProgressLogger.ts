/**
 * ProgressLogger - Logger especializado para operações com progresso
 * 
 * Uso:
 * const progress = new ProgressLogger('Download', { total: 100, unit: 'MB' });
 * progress.update(50);
 * progress.complete();
 * 
 * Ou:
 * const progress = new ProgressLogger('Processando', { total: files.length, unit: 'arquivos' });
 * for (let i = 0; i < files.length; i++) {
 *   await process(files[i]);
 *   progress.increment();
 * }
 * progress.complete();
 */

import { Logger } from './Logger';
import { Colors } from './colors';

export interface ProgressOptions {
  total: number;
  unit?: string;
  width?: number;
  showPercentage?: boolean;
  showEta?: boolean;
  showCount?: boolean;
}

export class ProgressLogger {
  private name: string;
  private options: Required<ProgressOptions>;
  private current = 0;
  private startTime: number;
  private logger: Logger;
  private lastUpdate = 0;
  private updateInterval = 100; // ms - limita updates para não flickerar

  constructor(name: string, options: ProgressOptions, logger?: Logger) {
    this.name = name;
    this.logger = logger || Logger.getInstance();
    this.startTime = Date.now();
    
    this.options = {
      total: options.total,
      unit: options.unit || '',
      width: options.width || 30,
      showPercentage: options.showPercentage !== false,
      showEta: options.showEta !== false,
      showCount: options.showCount !== false,
    };
  }

  /**
   * Atualiza o progresso para um valor específico
   */
  update(value: number): void {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval && value < this.options.total) {
      return; // Rate limiting de updates visuais
    }
    
    this.current = Math.min(value, this.options.total);
    this.lastUpdate = now;
    this.render();
  }

  /**
   * Incrementa o progresso
   */
  increment(amount = 1): void {
    this.update(this.current + amount);
  }

  /**
   * Marca como completo
   */
  complete(message?: string): void {
    this.current = this.options.total;
    this.render();
    
    // Limpa a linha atual
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const finalMessage = message || `${this.name} concluído`;
    
    this.logger.success(`${finalMessage} (${duration}s)`);
  }

  /**
   * Falha no progresso
   */
  fail(message?: string): void {
    // Limpa a linha atual
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    
    const finalMessage = message || `${this.name} falhou`;
    this.logger.error(finalMessage);
  }

  /**
   * Renderiza a barra de progresso
   */
  private render(): void {
    const { total, width, showPercentage, showEta, showCount, unit } = this.options;
    const ratio = this.current / total;
    const filled = Math.floor(ratio * width);
    const empty = width - filled;
    
    // Caracteres da barra
    const barFilled = '█'.repeat(filled);
    const barEmpty = '░'.repeat(empty);
    
    const primaryColor = Colors.primary;
    const dimColor = Colors.dim;
    const whiteColor = Colors.white;
    const reset = Colors.reset;
    
    let line = '\r  ';
    
    // Nome da operação
    line += `${primaryColor}▸${reset} ${dimColor}${this.name}${reset} `;
    
    // Barra
    line += `${primaryColor}[${barFilled}${barEmpty}]${reset}`;
    
    // Porcentagem
    if (showPercentage) {
      const percentage = Math.floor(ratio * 100);
      line += ` ${whiteColor}${percentage}%${reset}`;
    }
    
    // Contagem
    if (showCount) {
      line += ` ${dimColor}(${this.current}/${total}${unit ? ' ' + unit : ''})${reset}`;
    }
    
    // ETA
    if (showEta && this.current > 0 && this.current < total) {
      const elapsed = Date.now() - this.startTime;
      const rate = this.current / elapsed;
      const remaining = (total - this.current) / rate;
      const eta = Math.ceil(remaining / 1000);
      
      line += ` ${dimColor}(faltam ~${eta}s)${reset}`;
    }
    
    // Limpa o resto da linha e escreve
    process.stdout.write(line + '\x1b[K');
  }

  /**
   * Obtém porcentagem atual
   */
  getPercentage(): number {
    return Math.floor((this.current / this.options.total) * 100);
  }

  /**
   * Obtém valor atual
   */
  getCurrent(): number {
    return this.current;
  }

  /**
   * Obtém total
   */
  getTotal(): number {
    return this.options.total;
  }

  /**
   * Verifica se está completo
   */
  isComplete(): boolean {
    return this.current >= this.options.total;
  }
}

/**
 * Cria um progress logger (função helper)
 */
export function createProgress(name: string, options: ProgressOptions, logger?: Logger): ProgressLogger {
  return new ProgressLogger(name, options, logger);
}
