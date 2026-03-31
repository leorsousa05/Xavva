/**
 * Sistema de Logging do XAVVA CLI
 * 
 * Exporta todas as funcionalidades de logging para uso em toda a aplicação.
 * 
 * @example
 * ```typescript
 * import { Logger, OperationLogger, ProgressLogger, TableLogger } from '../logging';
 * 
 * // Log simples
 * Logger.info('Iniciando processo');
 * Logger.success('Concluído');
 * 
 * // Operação complexa
 * const op = new OperationLogger('deploy');
 * op.start();
 * const buildStep = op.step('build');
 * await build();
 * buildStep.success();
 * op.complete();
 * 
 * // Progresso
 * const progress = new ProgressLogger('Download', { total: 100, unit: 'MB' });
 * progress.update(50);
 * progress.complete();
 * 
 * // Tabela
 * const table = new TableLogger(['Nome', 'Versão']);
 * table.add(['Spring', '5.3.0']);
 * table.print();
 * ```
 */

// Tipos
export type {
  LogLevel,
  LogOutputMode,
  LogContext,
  LogEntry,
  LoggerConfig,
  RateLimitEntry,
  OperationStep,
  TableColumn,
  TableRow,
} from './types';

// Cores e utilitários
export {
  Colors,
  Icons,
  colorize,
  stripAnsi,
  visualWidth,
  padText,
  truncateText,
  getIcon,
  supportsColor,
} from './colors';

// Constantes
export {
  DEFAULT_CONFIG,
  LOG_LEVELS,
  LEVEL_COLORS,
  LEVEL_ICONS,
  LAYOUT,
  NOISE_PATTERNS,
  ESSENTIAL_PATTERNS,
  SPINNER_FRAMES,
  SPINNER_INTERVAL,
  FILE_LOG,
} from './constants';

// Formatadores
export {
  formatEntry,
  formatStatusLine,
  formatSection,
  formatConfig,
  formatUrl,
  formatFile,
} from './formatters';

// Logger principal
export { Logger, logger } from './Logger';

// Loggers especializados
export { OperationLogger, OperationStepLogger, createOperation } from './OperationLogger';
export { ProgressLogger, createProgress } from './ProgressLogger';
export { TableLogger, createTable, printTable } from './TableLogger';

// FileLogger
export { FileLogger, getFileLogger, configureFileLogger } from './FileLogger';
