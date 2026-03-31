/**
 * Cores e estilos ANSI para o sistema de logging
 * Paleta suave e moderna
 */

export const Colors = {
  // Reset
  reset: '\x1b[0m',
  
  // Estilos
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  // Cores principais
  primary: '\x1b[36m',       // Cyan
  primaryBright: '\x1b[96m', // Bright Cyan
  secondary: '\x1b[35m',     // Magenta
  
  // Estados
  success: '\x1b[32m',       // Green
  successBright: '\x1b[92m', // Bright Green
  warning: '\x1b[33m',       // Yellow
  error: '\x1b[31m',         // Red
  info: '\x1b[34m',          // Blue
  
  // Neutros
  white: '\x1b[37m',
  gray: '\x1b[90m',
  darkGray: '\x1b[38;5;240m',
  lightGray: '\x1b[38;5;250m',
  
  // Backgrounds
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
} as const;

export type ColorKey = keyof typeof Colors;

/**
 * Aplica cor ao texto
 */
export function colorize(text: string, color: ColorKey): string {
  return `${Colors[color]}${text}${Colors.reset}`;
}

/**
 * Remove códigos ANSI do texto
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[\d+m/g, '');
}

/**
 * Calcula largura visual do texto (ignorando ANSI)
 */
export function visualWidth(text: string): number {
  return stripAnsi(text).length;
}

/**
 * Preenche string até o tamanho especificado, considerando ANSI codes
 */
export function padText(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const plain = stripAnsi(text);
  const diff = width - plain.length;
  
  if (diff <= 0) return text;
  
  const padding = ' '.repeat(diff);
  
  switch (align) {
    case 'right':
      return padding + text;
    case 'center':
      const left = Math.floor(diff / 2);
      const right = diff - left;
      return ' '.repeat(left) + text + ' '.repeat(right);
    default:
      return text + padding;
  }
}

/**
 * Trunca texto mantendo códigos ANSI
 */
export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  const plain = stripAnsi(text);
  if (plain.length <= maxLength) return text;
  
  // Extrai todos os códigos ANSI para reconstruir
  const ansiCodes: string[] = [];
  let match;
  const ansiRegex = /\x1b\[\d+m/g;
  while ((match = ansiRegex.exec(text)) !== null) {
    ansiCodes.push(match[0]);
  }
  
  // Trunca o texto plano
  const truncatedPlain = plain.slice(0, maxLength - suffix.length) + suffix;
  
  // Reaplica os códigos ANSI (simplificado - apenas os que aparecem antes do corte)
  return truncatedPlain; // Versão simplificada sem ANSI
}

/**
 * Ícones semânticos para diferentes tipos de log
 * Usando caracteres ASCII/Unicode amplamente suportados
 */
export const Icons = {
  success: '✓',
  error: '✗',
  warning: '!',
  info: 'i',
  arrow: '->',
  bullet: '*',
  diamond: '>',
  circle: 'o',
  hotswap: '~',
  spinner: '|',
  pending: 'o',
  running: '>',
  ready: '✓',
  sync: '<>',
  build: '[b]',
  deploy: '[d]',
  server: '[s]',
  database: '[db]',
  search: '[?]',
  time: '[t]',
  file: '[f]',
  folder: '[dir]',
  link: '->',
  star: '*',
  check: '✓',
  cross: '✗',
  question: '?',
  exclamation: '!',
} as const;

export type IconKey = keyof typeof Icons;

/**
 * Obtém ícone com cor aplicada
 */
export function getIcon(name: IconKey, color?: ColorKey): string {
  const icon = Icons[name] || Icons.info;
  if (color) {
    return colorize(icon, color);
  }
  return icon;
}

/**
 * Verifica se o terminal suporta cores
 */
export function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}
