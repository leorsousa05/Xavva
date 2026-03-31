/**
 * UI Utils - Adaptador para o novo sistema de logging
 * 
 * Mantém compatibilidade com código existente enquanto usa
 * internamente o novo sistema de logging em src/logging/
 * 
 * @deprecated Use o novo sistema de logging em src/logging/
 */

import pkg from "../../package.json";
import type { DashboardService } from "../services/DashboardService";
import { Logger, Colors, Icons, colorize, stripAnsi, padText } from "../logging";
import { LAYOUT, NOISE_PATTERNS, ESSENTIAL_PATTERNS, SPINNER_FRAMES, SPINNER_INTERVAL } from "../logging/constants";

// Re-exporta Cores para compatibilidade
export const C = Colors;

// Largura das colunas para alinhamento
export const COL = LAYOUT.columns;

/**
 * @deprecated Use Logger de src/logging/ diretamente
 * 
 * Classe Logger legada - adaptador para o novo sistema
 */
export class LoggerLegacy {
	private static dashboard: DashboardService | null = null;
	private static activeSpinner: { stop: (success?: boolean) => void } | null = null;
	private static sectionOpen = false;
	private static logger = Logger.getInstance();

	static setDashboard(dashboard: DashboardService) {
		this.dashboard = dashboard;
		// Também configura no novo logger se necessário
	}

	// Helper: remove ANSI codes para calcular tamanho
	private static plain(s: string): string {
		return stripAnsi(s);
	}

	// Helper: pad com consideração de ANSI codes
	private static pad(s: string, len: number): string {
		return padText(s, len);
	}

	/**
	 * Banner clean e moderno
	 */
	static banner(command?: string, profile?: string, encoding?: string) {
		console.clear();
		const name = process.cwd().split(/[/\\]/).pop() || "project";
		const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
		const git = this.getGitContext();
		
		// Header linha única
		const left = `${C.primary}${C.bold}xavva${C.reset} v${pkg.version}`;
		const center = `${C.white}${C.bold}${name}${C.reset}`;
		const right = `${C.dim}${now}${C.reset}`;
		
		console.log();
		console.log(`  ${left}  ${center}  ${right}`);
		
		// Linha divisória simples
		console.log(`  ${C.darkGray}${'─'.repeat(60)}${C.reset}`);
		
		// Contexto em uma linha
		const ctx: string[] = [];
		if (command) ctx.push(`${C.primary}${command}${C.reset}`);
		if (profile) ctx.push(`${C.warning}${profile}${C.reset}`);
		const java = this.getJavaVersion();
		if (java) ctx.push(`java:${C.dim}${java}${C.reset}`);
		if (git.branch) ctx.push(`${C.gray}git:${git.branch}${git.dirty ? '*' : ''}${C.reset}`);
		
		if (ctx.length > 0) {
			console.log(`  ${ctx.join('  ')}`);
		}
		
		console.log();
		
		// Cabeçalho da tabela
		console.log(`  ${C.bold}${this.pad('NOME', COL.name)}${this.pad('STATUS', COL.status)}INFO${C.reset}`);
		console.log(`  ${C.darkGray}${'─'.repeat(60)}${C.reset}`);
		
		this.sectionOpen = true;
	}

	/**
	 * Status lateral estilo docker-compose
	 */
	static status(name: string, status: 'pending' | 'running' | 'done' | 'error' | 'warning', info?: string) {
		this.logger.status(name, status, info);
	}

	/**
	 * Seção de arquivos (para watch mode)
	 */
	static filesSection(title: string = "Changes") {
		this.logger.section(title);
	}

	/**
	 * Arquivo individual na seção
	 */
	static file(name: string, action: 'changed' | 'compiled' | 'synced' | 'error', path?: string) {
		this.logger.file(name, action, path);
	}

	/**
	 * Resultado/sumário
	 */
	static summary(text: string) {
		this.logger.step(text);
	}

	/**
	 * URL formatada
	 */
	static url(label: string, url: string) {
		this.logger.url(label, url);
	}

	/**
	 * Divisor simples
	 */
	static divider() {
		this.logger.divider();
	}

	/**
	 * Finalização
	 */
	static done() {
		this.logger.newline();
	}

	// ========== Métodos legados - mantidos para compatibilidade ==========

	static section(title: string) {
		this.logger.section(title);
	}

	static endSection() {
		this.logger.newline();
	}

	static config(label: string, value: string | number | boolean) {
		this.logger.config(label, value);
	}

	static ready(msg: string) {
		this.logger.ready(msg);
	}

	static info(label: string, value?: string) {
		if (value) {
			this.logger.info(`${label}: ${value}`);
		} else {
			this.logger.info(label);
		}
	}

	static success(msg: string) {
		this.logger.success(msg);
	}

	static error(msg: string) {
		this.logger.error(msg);
	}

	static warn(msg: string) {
		this.logger.warn(msg);
	}

	static debug(msg: string) {
		this.logger.debug(msg);
	}

	static step(msg: string) {
		this.logger.step(msg);
	}

	static log(msg: string) {
		console.log(msg);
	}

	static newline() {
		this.logger.newline();
	}

	// Watch mode - arquivo modificado (legado)
	static fileChanged(filepath: string) {
		const filename = filepath.split(/[/\\]/).pop() || filepath;
		this.file(filename, 'changed');
	}

	// Watch mode - arquivo compilado/sincronizado (legado)
	static fileSynced(filename: string, action: 'compiled' | 'synced' | 'reloaded' = 'synced') {
		const map = { compiled: 'compiled', synced: 'synced', reloaded: 'reloaded' };
		this.file(filename, action === 'reloaded' ? 'synced' : action, `[${map[action]}]`);
	}

	// Watch mode - batch de arquivos (legado)
	static filesBatch(count: number, action: string) {
		this.logger.summary(`${count} arquivo(s) ${action}`);
	}

	static watcher(msg: string, _type?: string) {
		this.logger.debug(`watch: ${msg}`);
	}

	static watch(msg: string) {
		this.logger.debug(`watch: ${msg}`);
	}

	static process(msg: string) {
		this.logger.status('process', 'running', msg);
	}

	static build(msg: string) {
		if (msg.includes('completed') || msg.includes('done') || msg.includes('concluído')) {
			this.logger.status('build', 'done', msg);
		} else if (msg.includes('compil')) {
			this.logger.status('build', 'running', msg);
		} else {
			this.logger.status('build', 'pending', msg);
		}
	}

	static server(msg: string) {
		if (msg.includes('ready') || msg.includes('done') || msg.includes('pronto')) {
			this.logger.status('server', 'done', msg);
		} else {
			this.logger.status('server', 'running', msg);
		}
	}

	static hotswap(msg: string) {
		this.logger.debug(`hotswap: ${msg}`);
	}

	/**
	 * Spinner moderno
	 */
	static spinner(msg: string) {
		if (this.dashboard?.isTuiActive()) {
			return this.dashboard.spinner(msg);
		}

		// Usa spinner ASCII simples para melhor compatibilidade com Windows
		const frames = ['|', '/', '-', '\\'];
		let i = 0;
		
		process.stdout.write("  ");
		process.stdout.write("\x1B[?25l");
		
		const timer = setInterval(() => {
			process.stdout.write(`\r  ${C.primary}${frames[i]}${C.reset} ${C.dim}${msg}${C.reset}`);
			i = (i + 1) % frames.length;
		}, SPINNER_INTERVAL);

		return (success = true) => {
			clearInterval(timer);
			process.stdout.write("\x1B[?25h");
			if (success) {
				console.log(`\r  ${C.success}✓${C.reset} ${msg}`);
			} else {
				console.log(`\r  ${C.error}✗${C.reset} ${C.error}${msg}${C.reset}`);
			}
		};
	}

	// ========== Helpers privados ==========

	private static getGitStatus(): { dirty: boolean; modified: number } {
		try {
			const result = Bun.spawnSync(["git", "status", "--porcelain"]);
			const lines = result.stdout.toString().trim().split('\n').filter(l => l.trim());
			return { dirty: lines.length > 0, modified: lines.length };
		} catch {
			return { dirty: false, modified: 0 };
		}
	}

	private static getGitContext(): { branch: string; dirty: boolean } {
		try {
			const branch = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.toString().trim();
			const status = this.getGitStatus();
			return { branch, dirty: status.dirty };
		} catch {
			return { branch: "", dirty: false };
		}
	}

	private static getJavaVersion(): string | null {
		try {
			const javaBin = process.env.JAVA_HOME 
				? `${process.env.JAVA_HOME}/bin/java`
				: 'java';
			const result = Bun.spawnSync([javaBin, "-version"]);
			const output = (result.stderr?.toString() || result.stdout?.toString() || '');
			const match = output.match(/version "?(\d+(?:\.\d+)?)/);
			if (match) {
				const v = match[1];
				if (output.toLowerCase().includes('dcevm') || output.toLowerCase().includes('jbr')) {
					return `${v}+dcevm`;
				}
				return v;
			}
			return null;
		} catch {
			return null;
		}
	}

	// ========== Log Formatting (mantidos para compatibilidade) ==========
	
	static isSystemNoise(line: string): boolean {
		return NOISE_PATTERNS.system.some(n => line.includes(n));
	}

	static isEssential(line: string): boolean {
		return ESSENTIAL_PATTERNS.some(pattern => line.includes(pattern));
	}

	static summarize(line: string): string {
		if (this.isSystemNoise(line)) return "";

		const startupMatch = line.match(/Server startup in.*?([\d,]+)\s*ms/);
		if (startupMatch) {
			const time = startupMatch[1].replace(",", "");
			const seconds = (parseInt(time) / 1000).toFixed(1);
			return `${C.success}pronto ${C.gray}em ${C.white}${seconds}s${C.reset}`;
		}

		if (line.includes("HOTSWAP AGENT") && line.includes("RELOAD")) {
			return `${C.primary}↻ hotswap${C.reset}`;
		}

		const compilationError = line.match(/\[ERROR\].*?(\w+\.java):\[(\d+).*?\]\s*(.+)/);
		if (compilationError) {
			const [, file, lineNum, msg] = compilationError;
			return `${C.error}✗ ${C.white}${file}${C.gray}:${lineNum}${C.reset} ${C.gray}${msg.slice(0, 80)}${C.reset}`;
		}

		if (line.includes("SEVERE") || line.includes("Exception")) {
			return `${C.error}✗ ${C.gray}${line.slice(0, 200)}${C.reset}`;
		}

		// WARNING/ADVERTÊNCIA: só mostra no modo verbose, não no modo normal
		// (removido do summarize para não aparecer em modo não-verbose)
		if (line.includes("WARNING") || line.includes("ADVERTÊNCIA")) {
			return ""; // Silenciado no modo normal - use --verbose para ver
		}

		return "";
	}

	private static tomcatNoisePatterns = NOISE_PATTERNS.tomcat;

	// Padrões que são noise em modo não-verbose, mas úteis no verbose
	private static tomcatVerbosePatterns = [
		/^HOTSWAP AGENT:/,
		/^context:/,
		/^delegate:/,
		/^----------> Parent Classloader:/,
		/^java\.net\.URLClassLoader/,
	];

	static isTomcatNoise(line: string): boolean {
		return this.tomcatNoisePatterns.some(p => p.test(line));
	}

	// Logs que são noise em modo normal, mas úteis no verbose
	static isTomcatVerboseLog(line: string): boolean {
		return this.tomcatVerbosePatterns.some(p => p.test(line));
	}

	static formatTomcatLog(line: string): string {
		const cleanLine = line.trim();
		if (!cleanLine) return "";
		if (this.isTomcatNoise(cleanLine)) return "";

		// Server startup
		if (cleanLine.includes("Server startup in")) {
			const match = cleanLine.match(/Server startup in.*?([\d,]+)\s*ms/);
			if (match) {
				const seconds = (parseInt(match[1].replace(",", "")) / 1000).toFixed(1);
				return `  ${C.success}✓ server${C.reset} ${C.dim}pronto em ${seconds}s${C.reset}`;
			}
		}

		// Stack trace - linhas começando com "at "
		if (cleanLine.startsWith("at ") && cleanLine.includes("(")) {
			const match = cleanLine.match(/at\s+([\w.$]+)\.(\w+)\s*\(([^:]+):?(\d*)\)/);
			if (match) {
				const [, className, method, file, lineNum] = match;
				const shortClass = className.split('.').pop() || className;
				return `      ${C.dim}at ${C.gray}${shortClass}.${method}(${file}${lineNum ? ':' + lineNum : ''})${C.reset}`;
			}
			return `      ${C.dim}${cleanLine.slice(0, 100)}${C.reset}`;
		}

		// Exception/Caused by
		if (cleanLine.includes("Exception:") || cleanLine.includes("Caused by:")) {
			const isCausedBy = cleanLine.includes("Caused by:");
			const prefix = isCausedBy ? "Caused by: " : "";
			const color = isCausedBy ? C.warning : C.error;
			return `  ${color}${isCausedBy ? '↳' : '✗'} ${prefix}${cleanLine.slice(prefix.length, 120)}${C.reset}`;
		}

		// HOTSWAP AGENT logs
		if (cleanLine.startsWith("HOTSWAP AGENT:")) {
			const match = cleanLine.match(/HOTSWAP AGENT:\s+([\d:.]+)\s+(\w+)\s+\(([^)]+)\)\s+-\s*(.+)/);
			if (match) {
				const [, time, level, source, message] = match;
				const levelColor = level === "ERROR" ? C.error : level === "WARN" ? C.warning : C.primary;
				return `  ${C.primary}↻${C.reset} ${C.dim}[${time}]${C.reset} ${levelColor}${level}${C.reset} ${C.gray}${message.slice(0, 80)}${C.reset}`;
			}
			return `  ${C.primary}↻${C.reset} ${C.gray}${cleanLine.slice(15, 120)}${C.reset}`;
		}

		// Context classloader logs
		if (cleanLine.startsWith("context:") || cleanLine.startsWith("delegate:") || cleanLine.startsWith("'.") || cleanLine.startsWith("java.net.URLClassLoader")) {
			return `  ${C.dim}◆ ${cleanLine.slice(0, 100)}${C.reset}`;
		}

		if (cleanLine.includes("Parent Classloader:")) {
			return `  ${C.dim}◆ ${cleanLine.slice(0, 100)}${C.reset}`;
		}

		// SEVERE/ERROR
		if (cleanLine.includes("SEVERE") || cleanLine.includes("ERROR")) {
			return `  ${C.error}✗${C.reset} ${C.gray}${cleanLine.slice(0, 120)}${C.reset}`;
		}

		// WARNING/ADVERTÊNCIA
		if (cleanLine.includes("WARNING") || cleanLine.includes("ADVERTÊNCIA")) {
			return `  ${C.warning}!${C.reset} ${C.gray}${cleanLine.slice(0, 120)}${C.reset}`;
		}

		// SLF4J logs
		if (cleanLine.startsWith("SLF4J:")) {
			return `  ${C.warning}⚠${C.reset} ${C.gray}${cleanLine.slice(6, 120)}${C.reset}`;
		}

		// No modo verbose, retorna a linha formatada simples para não perder logs
		return `  ${C.gray}${cleanLine.slice(0, 120)}${C.reset}`;
	}

	private static buildNoisePatterns = NOISE_PATTERNS.build;

	static isBuildNoise(line: string): boolean {
		return this.buildNoisePatterns.some(p => p.test(line));
	}

	static formatBuildLog(line: string, _buildTool: 'maven' | 'gradle' = 'maven'): string {
		const cleanLine = line.trim();
		if (!cleanLine) return "";
		if (this.isBuildNoise(cleanLine)) return "";

		// ERROR de compilação com arquivo e linha
		const errorMatch = cleanLine.match(/^\[ERROR\]\s+(.+\.java):\[(\d+),\d+\]\s*(.+)/);
		if (errorMatch) {
			const [, file, lineNum, msg] = errorMatch;
			const shortFile = file.split(/[/\\]/).pop() || file;
			return `  ${C.error}✗${C.reset} ${C.white}${shortFile}${C.gray}:${lineNum}${C.reset} ${C.error}${msg.slice(0, 80)}${C.reset}`;
		}

		// ERROR genérico
		if (cleanLine.startsWith("[ERROR]")) {
			return `  ${C.error}✗${C.reset} ${C.gray}${cleanLine.slice(7, 120)}${C.reset}`;
		}

		// WARNING
		if (cleanLine.startsWith("[WARNING]")) {
			return `  ${C.warning}!${C.reset} ${C.gray}${cleanLine.slice(9, 120)}${C.reset}`;
		}

		// Compiling
		const compilingMatch = cleanLine.match(/^\[INFO\]\s+Compiling\s+(\d+)\s+source/);
		if (compilingMatch) {
			return `  ${C.primary}●${C.reset} ${C.dim}compilando ${C.white}${compilingMatch[1]}${C.reset} ${C.dim}arquivos${C.reset}`;
		}

		// Copying resources
		if (cleanLine.includes("Copying") && cleanLine.includes("resource")) {
			const match = cleanLine.match(/Copying\s+(\d+)\s+resource/);
			if (match) {
				return `  ${C.dim}→ copiando ${match[1]} recursos${C.reset}`;
			}
		}

		// Building project info
		if (cleanLine.includes("Building ") && cleanLine.includes("<")) {
			const match = cleanLine.match(/Building\s+(.+)/);
			if (match) {
				return `  ${C.primary}●${C.reset} ${C.white}${match[1]}${C.reset}`;
			}
		}

		// Recompile with -X
		if (cleanLine.includes("Recompile with -Xlint")) {
			return `  ${C.warning}⚠${C.reset} ${C.dim}recompile com -Xlint para detalhes${C.reset}`;
		}

		// Some input files use unchecked or unsafe operations
		if (cleanLine.includes("Some input files use") || cleanLine.includes("unchecked or unsafe")) {
			return `  ${C.warning}⚠${C.reset} ${C.gray}${cleanLine.slice(0, 100)}${C.reset}`;
		}

		return "";
	}
}

// Exporta Logger como padrão para compatibilidade
export { LoggerLegacy as Logger };
