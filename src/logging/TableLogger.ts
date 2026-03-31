/**
 * TableLogger - Logger especializado para exibição de dados tabulares
 * 
 * Uso:
 * const table = new TableLogger(['Nome', 'Versão', 'Status']);
 * table.add(['Spring', '5.3.0', '✓']);
 * table.add(['Hibernate', '6.0.0', '⚠']);
 * table.print();
 * 
 * Ou com opções de alinhamento:
 * const table = new TableLogger([
 *   { header: 'ID', align: 'center', width: 10 },
 *   { header: 'Nome', align: 'left' },
 *   { header: 'Valor', align: 'right', width: 15 }
 * ]);
 */

import type { TableColumn, TableRow } from './types';
import { Logger } from './Logger';
import { Colors, stripAnsi, visualWidth, padText } from './colors';

export interface TableOptions {
  headerStyle?: boolean;
  border?: boolean;
  compact?: boolean;
}

export class TableLogger {
  private columns: TableColumn[];
  private rows: TableRow[] = [];
  private options: Required<TableOptions>;
  private logger: Logger;

  constructor(
    columns: (string | TableColumn)[],
    options: TableOptions = {},
    logger?: Logger
  ) {
    this.logger = logger || Logger.getInstance();
    
    // Normaliza colunas
    this.columns = columns.map(col => {
      if (typeof col === 'string') {
        return { header: col, align: 'left' };
      }
      return { align: 'left', ...col };
    });
    
    this.options = {
      headerStyle: true,
      border: false,
      compact: false,
      ...options,
    };
  }

  /**
   * Adiciona uma linha à tabela
   */
  add(cells: (string | number)[], styles?: string[]): this {
    this.rows.push({
      cells: cells.map(c => String(c)),
      styles,
    });
    return this;
  }

  /**
   * Adiciona múltiplas linhas
   */
  addMany(rows: (string | number)[][]): this {
    for (const row of rows) {
      this.add(row);
    }
    return this;
  }

  /**
   * Limpa todas as linhas
   */
  clear(): this {
    this.rows = [];
    return this;
  }

  /**
   * Define larguras das colunas baseado no conteúdo
   */
  private calculateWidths(): number[] {
    const widths: number[] = [];
    
    for (let i = 0; i < this.columns.length; i++) {
      const col = this.columns[i];
      
      // Se já tem largura definida, usa ela
      if (col.width) {
        widths[i] = col.width;
        continue;
      }
      
      // Calcula largura máxima baseada no header e conteúdo
      let maxWidth = visualWidth(col.header);
      
      for (const row of this.rows) {
        const cell = row.cells[i] || '';
        maxWidth = Math.max(maxWidth, visualWidth(cell));
      }
      
      // Adiciona padding
      widths[i] = maxWidth + 2;
    }
    
    return widths;
  }

  /**
   * Renderiza a tabela
   */
  render(): string {
    if (this.rows.length === 0 && this.options.compact) {
      return '';
    }
    
    const widths = this.calculateWidths();
    const lines: string[] = [];
    
    // Linha de borda superior
    if (this.options.border) {
      let border = '  ┌';
      for (let i = 0; i < widths.length; i++) {
        border += '─'.repeat(widths[i] + 2);
        if (i < widths.length - 1) border += '┬';
      }
      border += '┐';
      lines.push(Colors.darkGray + border + Colors.reset);
    }
    
    // Header
    const headerCells = this.columns.map((col, i) => {
      const width = widths[i];
      const padded = padText(col.header, width, col.align);
      return this.options.headerStyle 
        ? `${Colors.bold}${padded}${Colors.reset}`
        : padded;
    });
    
    const headerLine = this.options.border
      ? `  │ ${headerCells.join(' │ ')} │`
      : '  ' + headerCells.join('');
    lines.push(headerLine);
    
    // Linha separadora
    if (this.options.border) {
      let sep = '  ├';
      for (let i = 0; i < widths.length; i++) {
        sep += '─'.repeat(widths[i] + 2);
        if (i < widths.length - 1) sep += '┼';
      }
      sep += '┤';
      lines.push(Colors.darkGray + sep + Colors.reset);
    } else if (!this.options.compact) {
      let sep = '  ';
      for (let i = 0; i < widths.length; i++) {
        sep += '─'.repeat(widths[i]);
      }
      lines.push(Colors.darkGray + sep + Colors.reset);
    }
    
    // Linhas de dados
    for (const row of this.rows) {
      const cells = row.cells.map((cell, i) => {
        const width = widths[i];
        const col = this.columns[i];
        const style = row.styles?.[i] || '';
        const reset = style ? Colors.reset : '';
        return style + padText(cell, width, col.align) + reset;
      });
      
      const line = this.options.border
        ? `  │ ${cells.join(' │ ')} │`
        : '  ' + cells.join('');
      lines.push(line);
    }
    
    // Linha de borda inferior
    if (this.options.border) {
      let border = '  └';
      for (let i = 0; i < widths.length; i++) {
        border += '─'.repeat(widths[i] + 2);
        if (i < widths.length - 1) border += '┴';
      }
      border += '┘';
      lines.push(Colors.darkGray + border + Colors.reset);
    }
    
    return lines.join('\n');
  }

  /**
   * Imprime a tabela
   */
  print(): void {
    const output = this.render();
    if (output) {
      this.logger.info(output);
    }
  }

  /**
   * Obtém número de linhas
   */
  getRowCount(): number {
    return this.rows.length;
  }

  /**
   * Obtém número de colunas
   */
  getColumnCount(): number {
    return this.columns.length;
  }
}

/**
 * Cria uma tabela (função helper)
 */
export function createTable(
  columns: (string | TableColumn)[],
  options?: TableOptions,
  logger?: Logger
): TableLogger {
  return new TableLogger(columns, options, logger);
}

/**
 * Imprime uma tabela simples rapidamente
 */
export function printTable(
  headers: string[],
  rows: (string | number)[][],
  logger?: Logger
): void {
  const table = new TableLogger(headers, {}, logger);
  table.addMany(rows);
  table.print();
}
