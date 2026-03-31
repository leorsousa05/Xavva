/**
 * Formatadores de saída para diferentes modos de log
 */

import type { LogEntry, LogOutputMode, LoggerConfig } from './types';
import { Colors, stripAnsi, visualWidth, padText } from './colors';
import { LEVEL_COLORS, LAYOUT } from './constants';

/**
 * Formata timestamp
 */
function formatTimestamp(date: Date, config: LoggerConfig): string {
  if (!config.timestamps) return '';
  
  const now = new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  // Se for o mesmo dia, mostra apenas hora
  if (now.toDateString() === date.toDateString()) {
    return `${Colors.gray}${hours}:${minutes}:${seconds}${Colors.reset} `;
  }
  
  // Caso contrário, mostra data completa
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${Colors.gray}${day}/${month} ${hours}:${minutes}:${seconds}${Colors.reset} `;
}

/**
 * Formata nível de log
 */
function formatLevel(level: string, config: LoggerConfig): string {
  if (!config.colors) {
    return `[${level.toUpperCase()}] `;
  }
  
  const colorKey = LEVEL_COLORS[level as keyof typeof LEVEL_COLORS] || 'reset';
  const color = Colors[colorKey];
  const padded = level.toUpperCase().padStart(5);
  
  return `${color}${padded}${Colors.reset} `;
}

/**
 * Formata indentação
 */
function formatIndent(indent: number): string {
  const size = Math.min(indent, LAYOUT.maxIndent) * LAYOUT.indentSize;
  return ' '.repeat(size);
}

/**
 * Formata metadados
 */
function formatMetadata(metadata: Record<string, unknown> | undefined, indent: number): string {
  if (!metadata || Object.keys(metadata).length === 0) return '';
  
  const prefix = '\n' + formatIndent(indent + 1);
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(metadata)) {
    let formattedValue: string;
    
    if (value === null) {
      formattedValue = 'null';
    } else if (value === undefined) {
      formattedValue = 'undefined';
    } else if (typeof value === 'object') {
      try {
        formattedValue = JSON.stringify(value);
      } catch {
        formattedValue = '[Object]';
      }
    } else if (typeof value === 'string' && value.length > 100) {
      formattedValue = value.slice(0, 97) + '...';
    } else {
      formattedValue = String(value);
    }
    
    const keyStr = `${Colors.dim}${key}:${Colors.reset}`;
    const valueStr = `${Colors.white}${formattedValue}${Colors.reset}`;
    lines.push(`${prefix}${keyStr} ${valueStr}`);
  }
  
  return lines.join('');
}

/**
 * Formata trace ID
 */
function formatTraceId(traceId: string | undefined): string {
  if (!traceId) return '';
  return `${Colors.darkGray}[${traceId}]${Colors.reset} `;
}

/**
 * Formata mensagem completa no modo pretty
 */
export function formatPretty(entry: LogEntry, config: LoggerConfig): string {
  const parts: string[] = [];
  
  // Timestamp
  parts.push(formatTimestamp(entry.timestamp, config));
  
  // Trace ID (só mostra em modo debug/trace ou quando explicitamente configurado)
  if (config.level === 'debug' || config.level === 'trace' || config.level === 'silly') {
    parts.push(formatTraceId(entry.context?.traceId));
  }
  
  // Indentação
  parts.push(formatIndent(entry.context?.indent || 0));
  
  // Nível (apenas para debug/trace, outros têm ícones)
  if (['debug', 'trace', 'silly'].includes(entry.level)) {
    parts.push(formatLevel(entry.level, config));
  }
  
  // Mensagem
  parts.push(entry.message);
  
  // Metadados
  if (entry.metadata) {
    parts.push(formatMetadata(entry.metadata, entry.context?.indent || 0));
  }
  
  return parts.join('');
}

/**
 * Formata mensagem no modo minimal
 */
export function formatMinimal(entry: LogEntry, config: LoggerConfig): string {
  // No modo minimal, ignora debug/trace/silly
  if (['debug', 'trace', 'silly'].includes(entry.level)) {
    return '';
  }
  
  const parts: string[] = [];
  
  // Timestamp opcional
  if (config.timestamps) {
    const hours = entry.timestamp.getHours().toString().padStart(2, '0');
    const minutes = entry.timestamp.getMinutes().toString().padStart(2, '0');
    parts.push(`${hours}:${minutes} `);
  }
  
  // Ícone baseado no nível
  let icon = '';
  switch (entry.level) {
    case 'error':
      icon = '✗';
      break;
    case 'warn':
      icon = '!';
      break;
    case 'success':
      icon = '✓';
      break;
    case 'info':
      icon = '→';
      break;
  }
  
  if (icon) {
    parts.push(`${icon} `);
  }
  
  // Mensagem (sem cores)
  parts.push(stripAnsi(entry.message));
  
  return parts.join('');
}

/**
 * Formata mensagem no modo JSON
 */
export function formatJson(entry: LogEntry): string {
  const obj = {
    timestamp: entry.timestamp.toISOString(),
    level: entry.level,
    message: stripAnsi(entry.message),
    ...entry.context,
    metadata: entry.metadata,
  };
  
  return JSON.stringify(obj);
}

/**
 * Formata mensagem de acordo com o modo configurado
 */
export function formatEntry(entry: LogEntry, config: LoggerConfig): string {
  switch (config.mode) {
    case 'json':
      return formatJson(entry);
    case 'minimal':
      return formatMinimal(entry, config);
    case 'silent':
      return '';
    case 'pretty':
    default:
      return formatPretty(entry, config);
  }
}

/**
 * Formata linha de status (nome, status, info)
 */
export function formatStatusLine(
  name: string,
  status: 'pending' | 'running' | 'success' | 'error' | 'warning',
  info?: string,
  config?: LoggerConfig
): string {
  const colors = config?.colors !== false;
  
  const statusConfig = {
    pending: { icon: '○', color: Colors.gray, text: 'pendente' },
    running: { icon: '●', color: Colors.primary, text: 'executando' },
    success: { icon: '✓', color: Colors.success, text: 'concluído' },
    error: { icon: '✗', color: Colors.error, text: 'erro' },
    warning: { icon: '!', color: Colors.warning, text: 'aviso' },
  };
  
  const s = statusConfig[status];
  const indent = formatIndent(1);
  
  let line = indent;
  
  // Nome
  line += padText(name, LAYOUT.columns.name);
  
  // Status
  const statusText = colors 
    ? `${s.color}${s.icon} ${s.text}${Colors.reset}`
    : `${s.icon} ${s.text}`;
  line += padText(statusText, LAYOUT.columns.status);
  
  // Info
  if (info) {
    line += colors ? `${Colors.dim}${info}${Colors.reset}` : info;
  }
  
  return line;
}

/**
 * Formata seção com título
 */
export function formatSection(title: string, config?: LoggerConfig): string {
  const colors = config?.colors !== false;
  const indent = formatIndent(1);
  
  let output = '\n';
  output += indent;
  output += colors ? `${Colors.bold}${title}${Colors.reset}` : title;
  output += '\n';
  output += indent;
  output += colors 
    ? `${Colors.darkGray}${LAYOUT.borders.horizontal.repeat(40)}${Colors.reset}`
    : '-'.repeat(40);
  
  return output;
}

/**
 * Formata configuração (chave: valor)
 */
export function formatConfig(key: string, value: string | number | boolean, config?: LoggerConfig): string {
  const colors = config?.colors !== false;
  const indent = formatIndent(1);
  
  const keyStr = padText(`${key}:`, 12);
  let valueStr = String(value);
  
  if (colors) {
    if (typeof value === 'boolean') {
      valueStr = value 
        ? `${Colors.success}sim${Colors.reset}` 
        : `${Colors.gray}não${Colors.reset}`;
    } else {
      valueStr = `${Colors.white}${valueStr}${Colors.reset}`;
    }
  }
  
  return `${indent}${Colors.dim}${keyStr}${Colors.reset}${valueStr}`;
}

/**
 * Formata URL
 */
export function formatUrl(label: string, url: string, config?: LoggerConfig): string {
  const colors = config?.colors !== false;
  const indent = formatIndent(1);
  
  if (colors) {
    return `${indent}${Colors.success}→${Colors.reset} ${label}: ${Colors.primaryBright}${Colors.bold}${url}${Colors.reset}`;
  }
  return `${indent}→ ${label}: ${url}`;
}

/**
 * Formata arquivo (nome, ação, caminho)
 */
export function formatFile(
  name: string,
  action: 'changed' | 'compiled' | 'synced' | 'error',
  path?: string,
  config?: LoggerConfig
): string {
  const colors = config?.colors !== false;
  const indent = formatIndent(1);
  
  const actionConfig = {
    changed: { icon: '○', color: Colors.gray },
    compiled: { icon: '✓', color: Colors.success },
    synced: { icon: '✓', color: Colors.success },
    error: { icon: '✗', color: Colors.error },
  };
  
  const a = actionConfig[action];
  const displayName = name.length > 25 ? '...' + name.slice(-22) : name;
  
  let line = indent;
  line += colors ? `${a.color}${a.icon}${Colors.reset}` : a.icon;
  line += ' ';
  line += colors ? `${Colors.dim}${displayName}${Colors.reset}` : displayName;
  
  if (path) {
    line += ' ';
    line += colors ? `${Colors.darkGray}${path}${Colors.reset}` : path;
  }
  
  return line;
}
