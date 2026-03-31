/**
 * Tipos do sistema de logging
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'success' | 'debug' | 'trace' | 'silly';

export type LogOutputMode = 'pretty' | 'json' | 'minimal' | 'silent';

export interface LogContext {
  timestamp?: boolean;
  traceId?: string;
  indent?: number;
  prefix?: string;
  metadata?: Record<string, unknown>;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: LogContext;
  metadata?: Record<string, unknown>;
}

export interface LoggerConfig {
  level: LogLevel;
  mode: LogOutputMode;
  timestamps: boolean;
  colors: boolean;
  icons: boolean;
  fileLogging: boolean;
  logDir: string;
  maxLogFiles: number;
  rateLimitWindowMs: number;
  maxDuplicateLogs: number;
}

export interface RateLimitEntry {
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

export interface OperationStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startTime?: Date;
  endTime?: Date;
  message?: string;
  error?: Error;
}

export interface TableColumn {
  header: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
}

export interface TableRow {
  cells: string[];
  styles?: string[];
}
