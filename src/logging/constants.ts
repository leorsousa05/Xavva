/**
 * Constantes do sistema de logging
 */

import type { LoggerConfig } from './types';

// Configurações padrão
export const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  mode: 'pretty',
  timestamps: false,
  colors: true,
  icons: true,
  fileLogging: false,
  logDir: '.xavva/logs',
  maxLogFiles: 7,
  rateLimitWindowMs: 10000, // 10 segundos
  maxDuplicateLogs: 5,
};

// Níveis de log com valores numéricos para comparação
export const LOG_LEVELS = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  success: 3,
  debug: 4,
  trace: 5,
  silly: 6,
} as const;

// Cores associadas a cada nível de log
export const LEVEL_COLORS = {
  error: 'error' as const,
  warn: 'warning' as const,
  info: 'info' as const,
  success: 'success' as const,
  debug: 'gray' as const,
  trace: 'darkGray' as const,
  silly: 'darkGray' as const,
  silent: 'reset' as const,
};

// Ícones associados a cada nível de log
export const LEVEL_ICONS = {
  error: 'error',
  warn: 'warning',
  info: 'info',
  success: 'success',
  debug: 'bullet',
  trace: 'circle',
  silly: 'circle',
  silent: '',
} as const;

// Configurações de layout
export const LAYOUT = {
  // Larguras de colunas para alinhamento
  columns: {
    timestamp: 12,
    level: 8,
    name: 12,
    status: 10,
    info: 30,
  },
  
  // Caracteres de borda
  borders: {
    horizontal: '─',
    vertical: '│',
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    leftT: '├',
    rightT: '┤',
    cross: '┼',
  },
  
  // Identação
  indentSize: 2,
  maxIndent: 10,
  
  // Truncamento
  maxMessageLength: 500,
  maxLineLength: 120,
};

// Padrões de noise para filtragem
export const NOISE_PATTERNS = {
  // Maven/Gradle noise
  build: [
    /^\[INFO\]\s+Scanning for projects/,
    /^\[INFO\]\s+Building /,
    /^\[INFO\]\s+---\s+.*\s+---$/,
    /^\[INFO\]\s+T+E+\s*$/,
    /^\[INFO\]\s+BUILD\s+SUCCESS/i,
    /^\[INFO\]\s+Total time:/,
    /^\[INFO\]\s+Finished at:/,
    /^\[INFO\]\s+Final Memory:/,
  ],
  
  // Tomcat noise
  tomcat: [
    /^Using CATALINA_/,
    /^Using JRE_HOME/,
    /^Using CLASSPATH/,
    /^Using CATALINA_OPTS/,
    /^NOTE: Picked up JDK_JAVA_OPTIONS/,
    /^HOTSWAP AGENT:.*Plugin.*initialized in ClassLoader/,
    /^HOTSWAP AGENT:.*Registering directory/,
    /^HOTSWAP AGENT:.*WARNING.*TreeWatcherNIO.*Unable to watch/,
    /^HOTSWAP AGENT:.*INFO.*TreeWatcherNIO/,
    /^HOTSWAP AGENT:.*INFO.*PluginRegistry.*Discovered plugins/,
    /^HOTSWAP AGENT:.*INFO.*HotswapAgent.*Loading Hotswap agent/,
    /^HOTSWAP AGENT:.*INFO.*TomcatPlugin.*Tomcat plugin initialized/,
    /^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*VersionLoggerListener/,
    /^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*AprLifecycleListener/,
  ],
  
  // System noise
  system: [
    'Using CATALINA_',
    'Using JRE_HOME',
    'Using CLASSPATH',
    'Scanning for projects...',
    'Building ',
    '--- ',
    '+++ ',
    'SLF4J: ',
    'Discovered plugins:',
    'enhanced with plugin initialization',
    'Hotswap ready',
    'autoHotswap.delay',
    'watchResources=false',
    'TreeWatcherNIO',
    'HOTSWAP AGENT',
    'org.hotswap.agent',
    'org.glassfish.jersey',
    'org.apache.catalina',
    'org.apache.jasper',
  ],
};

// Padrões essenciais que sempre devem ser mostrados
export const ESSENTIAL_PATTERNS = [
  'SEVERE',
  'ERROR',
  'Exception',
  'Caused by',
  'Server startup in',
  'HOTSWAP AGENT:.*RELOAD',
  'BUILD FAILURE',
  'Compilation failure',
];

// Spinner frames - usando ASCII para melhor compatibilidade com Windows
export const SPINNER_FRAMES = {
  default: ['|', '/', '-', '\\'],
  dots: ['.', '..', '...', '....', '.....', '....', '...', '..'],
  line: ['-', '\\', '|', '/'],
  arrow: ['>', '->', '-->', '--->', '---->', '--->', '-->', '->'],
  pulse: ['#', '##', '###', '####', '#####', '####', '###', '##'],
};

// Intervalo do spinner em ms
export const SPINNER_INTERVAL = 80;

// Configurações de arquivo de log
export const FILE_LOG = {
  extension: '.log',
  dateFormat: 'YYYY-MM-DD',
  maxSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 7,
};
