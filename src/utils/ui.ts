import pkg from "../../package.json";
import type { DashboardService } from "../services/DashboardService";

// Paleta de cores moderna e minimalista
const C = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	italic: "\x1b[3m",
	
	// Cores principais
	primary: "\x1b[36m",      // Cyan
	primaryBright: "\x1b[96m", // Bright Cyan
	secondary: "\x1b[35m",     // Magenta
	
	// Estados
	success: "\x1b[32m",       // Green
	successBright: "\x1b[92m", // Bright Green
	warning: "\x1b[33m",       // Yellow
	warningBright: "\x1b[93m", // Bright Yellow
	error: "\x1b[31m",         // Red
	errorBright: "\x1b[91m",   // Bright Red
	info: "\x1b[34m",          // Blue
	
	// Neutros
	white: "\x1b[37m",
	gray: "\x1b[90m",
	lightGray: "\x1b[37m",
	darkGray: "\x1b[38;5;240m",
};

export class Logger {
	public static readonly C = C;
	private static dashboard: DashboardService | null = null;
	private static activeSpinner: { stop: (success?: boolean) => void } | null = null;
	private static lastDomain = "";

	static setDashboard(dashboard: DashboardService) {
		this.dashboard = dashboard;
	}

	// Banner moderno e clean
	static banner(command?: string, profile?: string, encoding?: string) {
		console.clear();
		const git = this.getGitContext();
		const name = process.cwd().split(/[/\\]/).pop() || "project";
		
		// Linha superior decorativa
		console.log(`${C.gray}┌────────────────────────────────────────────────────────┐${C.reset}`);
		
		// Logo e projeto
		console.log(`${C.gray}│${C.reset}  ${C.primary}${C.bold}XAVVA${C.reset}${C.gray}.${C.reset}${C.dim}v${pkg.version}${C.reset}  ${C.gray}│${C.reset}  ${C.white}${C.bold}${name}${C.reset}`);
		
		// Info adicional em uma linha
		const parts: string[] = [];
		if (command) parts.push(`${C.primary}${command}${C.reset}`);
		if (profile) parts.push(`${C.warning}profile:${profile}${C.reset}`);
		if (encoding) parts.push(`${C.info}${encoding}${C.reset}`);
		if (git.branch) parts.push(`${C.secondary}git:${git.branch}${C.reset}`);
		
		if (parts.length > 0) {
			console.log(`${C.gray}│${C.reset}  ${C.dim}mode${C.reset}  ${C.gray}│${C.reset}  ${parts.join(` ${C.gray}•${C.reset} `)}`);
		}
		
		// Linha inferior
		console.log(`${C.gray}└────────────────────────────────────────────────────────┘${C.reset}`);
		console.log();
	}

	// Seções com divisórias clean
	static section(title: string) {
		console.log(`${C.gray}┌─ ${C.white}${C.bold}${title}${C.reset}`);
	}

	static endSection() {
		console.log(`${C.gray}└${C.reset}`);
	}

	// Configurações em formato chave: valor alinhado
	static config(label: string, value: string | number | boolean) {
		const valueStr = String(value);
		const isBool = typeof value === 'boolean';
		const displayValue = isBool 
			? (value ? `${C.successBright}✓${C.reset} ${C.success}enabled${C.reset}` : `${C.gray}○${C.reset} ${C.gray}disabled${C.reset}`)
			: `${C.white}${valueStr}${C.reset}`;
		
		console.log(`${C.gray}│${C.reset}  ${C.dim}${label.padEnd(12)}${C.reset} ${C.gray}:${C.reset} ${displayValue}`);
	}

	// Status com ícones minimalistas
	static ready(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.success}●${C.reset} ${msg}`);
	}

	static info(label: string, value?: string) {
		if (value) {
			console.log(`${C.gray}│${C.reset}  ${C.dim}${label}${C.reset} ${C.gray}:${C.reset} ${C.white}${value}${C.reset}`);
		} else {
			console.log(`${C.gray}│${C.reset}  ${C.info}ℹ${C.reset} ${label}`);
		}
	}

	static success(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.success}✓${C.reset} ${msg}`);
	}

	static error(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.error}✗${C.reset} ${C.error}${msg}${C.reset}`);
	}

	static warn(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.warning}⚠${C.reset} ${msg}`);
	}

	static build(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}build${C.reset} ${C.gray}:${C.reset} ${msg}`);
	}

	static server(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}server${C.reset} ${C.gray}:${C.reset} ${msg}`);
	}

	static watch(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.secondary}◉${C.reset} ${C.dim}watch${C.reset} ${C.gray}:${C.reset} ${msg}`);
	}

	static hotswap(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.secondary}↻${C.reset} ${C.dim}hotswap${C.reset} ${C.gray}:${C.reset} ${msg}`);
	}

	// URL formatada de forma destacada
	static url(label: string, url: string) {
		console.log(`${C.gray}│${C.reset}  ${C.dim}${label}${C.reset} ${C.gray}:${C.reset} ${C.primaryBright}${C.bold}${url}${C.reset}`);
	}

	// Spinner moderno
	static spinner(msg: string) {
		if (this.dashboard?.isTuiActive()) {
			return this.dashboard.spinner(msg);
		}

		const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
		let i = 0;
		
		process.stdout.write(`${C.gray}│${C.reset}  `);
		process.stdout.write("\x1B[?25l");
		
		const timer = setInterval(() => {
			process.stdout.write(`\r${C.gray}│${C.reset}  ${C.primary}${frames[i]}${C.reset} ${C.dim}${msg}${C.reset}`);
			i = (i + 1) % frames.length;
		}, 80);

		return (success = true) => {
			clearInterval(timer);
			process.stdout.write("\x1B[?25h");
			if (success) {
				console.log(`\r${C.gray}│${C.reset}  ${C.success}✓${C.reset} ${msg}`);
			} else {
				console.log(`\r${C.gray}│${C.reset}  ${C.error}✗${C.reset} ${C.error}${msg}${C.reset}`);
			}
		};
	}

	// Linha em branco
	static newline() {
		console.log();
	}

	// Divisória simples
	static divider() {
		console.log(`${C.gray}├────────────────────────────────────────────────────────┤${C.reset}`);
	}

	// Finalização
	static done() {
		console.log(`${C.gray}└────────────────────────────────────────────────────────┘${C.reset}`);
		console.log();
	}

	// Helper para contexto git
	static getGitContext(): { branch: string; author: string; hash: string } {
		try {
			const branch = Bun.spawnSync(["git", "rev-parse", "abbrev-ref", "HEAD"]).stdout.toString().trim();
			const author = Bun.spawnSync(["git", "log", "-1", "format=%an"]).stdout.toString().trim();
			const hash = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]).stdout.toString().trim();
			return { branch, author, hash };
		} catch {
			return { branch: "", author: "", hash: "" };
		}
	}

	// Filtros de noise (mantidos)
	static isSystemNoise(line: string): boolean {
		const noise = [
			"Using CATALINA_", "Using JRE_HOME", "Using CLASSPATH", 
			"Scanning for projects...", "Building ", "--- ", "+++ ",
			"Arquivos processados em", "milliseconds",
			"SLF4J: ", "Discovered plugins:",
			"enhanced with plugin initialization", "Hotswap ready",
			"autoHotswap.delay", "watchResources=false",
		];
		return noise.some(n => line.includes(n));
	}

	// Sumarização de logs do Tomcat (simplificada)
	static summarize(line: string): string {
		if (this.isSystemNoise(line)) return "";

		// Server startup
		const startupMatch = line.match(/Server startup in.*?([\d,]+)\s*ms/);
		if (startupMatch) {
			const time = startupMatch[1].replace(",", "");
			const seconds = (parseInt(time) / 1000).toFixed(1);
			return `${C.success}ready ${C.gray}in ${C.white}${seconds}s${C.reset}`;
		}

		// Hotswap
		if (line.includes("HOTSWAP AGENT") && line.includes("RELOAD")) {
			return `${C.secondary}↻ hotswap ${C.gray}detected${C.reset}`;
		}

		// Erros de compilação
		const compilationError = line.match(/\[ERROR\].*?(\w+\.java):\[(\d+).*?\]\s*(.+)/);
		if (compilationError) {
			const [, file, lineNum, msg] = compilationError;
			return `${C.error}✗ ${C.white}${file}${C.gray}:${lineNum}${C.reset} ${C.gray}${msg.slice(0, 50)}${C.reset}`;
		}

		// Erros SEVERE
		if (line.includes("SEVERE") || line.includes("Exception")) {
			return `${C.error}✗ ${C.gray}${line.slice(0, 80)}${C.reset}`;
		}

		// Warnings
		if (line.includes("WARNING")) {
			return `${C.warning}⚠ ${C.gray}${line.slice(0, 80)}${C.reset}`;
		}

		return "";
	}
}
