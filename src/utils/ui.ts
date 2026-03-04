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

	// Banner completo com informações do ambiente
	static banner(command?: string, profile?: string, encoding?: string) {
		console.clear();
		const git = this.getGitContext();
		const name = process.cwd().split(/[/\\]/).pop() || "project";
		const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
		const W = 52; // Largura interna do box (espaço entre os ║)
		
		// Remove ANSI codes para calcular tamanho
		const plain = (s: string) => s.replace(/\x1b\[\d+m/g, '');
		
		// Cria uma linha com conteúdo alinhado à esquerda
		const row = (content: string) => {
			const pad = W - plain(content).length;
			return `${C.gray}║${C.reset} ${content}${' '.repeat(Math.max(0, pad))}${C.gray}║${C.reset}`;
		};
		
		// Linha superior
		console.log(`${C.gray}╔══════════════════════════════════════════════════════╗${C.reset}`);
		
		// Linha 1: XAVVA v2.2.0 + hora alinhada à direita
		const verPlain = `XAVVA v${pkg.version}`; // "XAVVA v2.2.0" = 12 chars
		const timePlain = now; // 5 chars
		const gap1 = W - verPlain.length - timePlain.length - 1; // -1 para deixar 1 espaço antes do ║
		const line1Content = `${C.primary}${C.bold}XAVVA${C.reset}${C.gray} v${pkg.version}${C.reset}${' '.repeat(Math.max(1, gap1))}${C.dim}${now}${C.reset}`;
		console.log(row(line1Content));
		
		// Linha 2: Nome do projeto
		console.log(row(`${C.white}${C.bold}${name}${C.reset}`));
		
		// Linha 3: Git info
		if (git.branch) {
			const gitStatus = this.getGitStatus();
			const dirty = gitStatus.dirty ? '*' : '';
			const author = git.author ? git.author.split(' ')[0].slice(0, 10) : '';
			const hash = git.hash ? git.hash.slice(0, 7) : '';
			const branchDisplay = git.branch.slice(0, 20); // Limita branch
			const gitLine = `${C.gray}git:${C.reset}${C.secondary}${branchDisplay}${dirty}${C.reset} ${C.dim}${hash}${C.reset} ${C.gray}by${C.reset} ${C.dim}${author}${C.reset}`;
			console.log(row(gitLine));
		}
		
		// Divisor
		console.log(`${C.gray}╠══════════════════════════════════════════════════════╣${C.reset}`);
		
		// Config: mode, profile, java, encoding
		const cfg: string[] = [];
		if (command) cfg.push(`${C.primary}${command}${C.reset}`);
		if (profile) cfg.push(`${C.warning}${profile}${C.reset}`);
		const jv = this.getJavaVersion();
		if (jv) cfg.push(`${C.info}java:${jv}${C.reset}`);
		if (encoding) cfg.push(`${C.gray}${encoding}${C.reset}`);
		
		if (cfg.length) {
			const sep = `${C.gray} │ ${C.reset}`;
			const cfgLine = `${C.dim}mode${C.reset} : ${cfg.join(sep)}`;
			console.log(row(cfgLine));
		}
		
		// Memory
		const mem = process.memoryUsage();
		const mb = Math.round((mem.heapUsed || mem.rss || 0) / 1024 / 1024);
		console.log(row(`${C.dim}mem${C.reset}  : ${mb}MB ${C.gray}heap${C.reset}`));
		
		// OS
		const plat = process.platform === 'win32' ? 'windows' : process.platform;
		console.log(row(`${C.dim}os${C.reset}   : ${plat} ${C.gray}|${C.reset} ${process.arch}`));
		
		// Rodapé
		console.log(`${C.gray}╚══════════════════════════════════════════════════════╝${C.reset}`);
		console.log();
	}

	private static getGitStatus(): { dirty: boolean; modified: number } {
		try {
			const result = Bun.spawnSync(["git", "status", "--porcelain"]);
			const lines = result.stdout.toString().trim().split('\n').filter(l => l.trim());
			return { dirty: lines.length > 0, modified: lines.length };
		} catch {
			return { dirty: false, modified: 0 };
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
				// Check for DCEVM
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

	static debug(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.gray}🐛 ${msg}${C.reset}`);
	}

	static step(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.gray}▸ ${msg}${C.reset}`);
	}

	static log(msg: string) {
		console.log(msg);
	}

	static dim(msg: string) {
		console.log(`${C.dim}${msg}${C.reset}`);
	}

	static newline() {
		console.log();
	}

	static watcher(msg: string, _type?: string) {
		console.log(`${C.gray}│${C.reset}  ${C.secondary}◉${C.reset} ${C.dim}watch${C.reset} ${C.gray}:${C.reset} ${msg}`);
	}

	static watch(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.secondary}◉${C.reset} ${C.dim}watch${C.reset} ${C.gray}:${C.reset} ${msg}`);
	}

	static process(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}process${C.reset} ${C.gray}:${C.reset} ${msg}`);
	}

	static build(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}build${C.reset} ${C.gray}:${C.reset} ${msg}`);
	}

	static server(msg: string) {
		console.log(`${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}server${C.reset} ${C.gray}:${C.reset} ${msg}`);
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
			const branch = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.toString().trim();
			const author = Bun.spawnSync(["git", "log", "-1", "--format=%an"]).stdout.toString().trim();
			const hash = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]).stdout.toString().trim();
			return { branch, author, hash };
		} catch {
			return { branch: "", author: "", hash: "" };
		}
	}

	// Filtros de noise (mantidos)
	// Controle de rate limiting para hotswap
	private static lastHotswapTime = 0;
	private static hotswapCount = 0;

	static isSystemNoise(line: string): boolean {
		const noise = [
			"Using CATALINA_", "Using JRE_HOME", "Using CLASSPATH", 
			"Scanning for projects...", "Building ", "--- ", "+++ ",
			"Arquivos processados em", "milliseconds",
			"SLF4J: ", "Discovered plugins:",
			"enhanced with plugin initialization", "Hotswap ready",
			"autoHotswap.delay", "watchResources=false",
			// HotswapAgent noise
			"TreeWatcherNIO", "HOTSWAP AGENT", "org.hotswap.agent",
			// Jersey/JAX-RS noise
			"org.glassfish.jersey", "The (sub)resource method",
			// Tomcat noise
			"org.apache.catalina", "org.apache.jasper",
		];
		return noise.some(n => line.includes(n));
	}

	static isEssential(line: string): boolean {
		return line.includes("SEVERE") || line.includes("ERROR") || line.includes("Exception") ||
			   line.includes("Caused by") || line.includes("at ") || line.includes("... ") ||
			   line.includes("Server startup in") || line.includes("HOTSWAP AGENT:");
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

		// Hotswap com rate limiting (evita spam)
		if (line.includes("HOTSWAP AGENT") && line.includes("RELOAD")) {
			const now = Date.now();
			if (now - this.lastHotswapTime < 2000) {
				this.hotswapCount++;
				return ""; // Silencia se dentro de 2s
			}
			this.lastHotswapTime = now;
			const count = this.hotswapCount > 0 ? ` ${C.gray}(${this.hotswapCount} more)${C.reset}` : "";
			this.hotswapCount = 0;
			return `${C.secondary}↻ hotswap${C.reset}${count}`;
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

		// Warnings (filtra noise conhecido)
		if (line.includes("WARNING") || line.includes("ADVERTÊNCIA")) {
			if (this.isSystemNoise(line)) return "";
			return `${C.warning}⚠ ${C.gray}${line.slice(0, 80)}${C.reset}`;
		}

		return "";
	}

	// ========== Tomcat Log Formatting ==========
	
	private static tomcatNoisePatterns = [
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
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*Command line argument/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*CATALINA_BASE/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*CATALINA_HOME/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*Server version/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*Server built/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*OS Name/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*OS Version/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*Architecture/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*Java Home/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*JVM Version/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*JVM Vendor/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*Loaded Apache Tomcat Native/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*APR capabilities/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*APR\/OpenSSL configuration/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*OpenSSL successfully initialized/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*Server initialization in/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*Starting service/,
		/^\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(INFORMAÇÕES|INFO)\s+\[main\].*Starting Servlet engine/,
		/^ParallelWebappClassLoader/,
		/^context:/,
		/^delegate:/,
		/^-+> Parent Classloader/,
		/^java\.net\.URLClassLoader/,
	];

	static isTomcatNoise(line: string): boolean {
		return this.tomcatNoisePatterns.some(p => p.test(line));
	}

	static formatTomcatLog(line: string): string {
		const cleanLine = line.trim();
		if (!cleanLine) return "";

		// Silencia noise completamente
		if (this.isTomcatNoise(cleanLine)) return "";

		// HOTSWAP AGENT: Loading Hotswap agent X.X.X
		if (cleanLine.includes("HOTSWAP AGENT") && cleanLine.includes("Loading Hotswap agent")) {
			const versionMatch = cleanLine.match(/Loading Hotswap agent ([\d.]+)/);
			if (versionMatch) {
				return `${C.gray}│${C.reset}  ${C.secondary}↻${C.reset} ${C.dim}HotswapAgent v${versionMatch[1]}${C.reset}`;
			}
		}

		// HOTSWAP AGENT: Discovered plugins
		if (cleanLine.includes("HOTSWAP AGENT") && cleanLine.includes("Discovered plugins")) {
			return `${C.gray}│${C.reset}  ${C.secondary}↻${C.reset} ${C.dim}plugins loaded${C.reset}`;
		}

		// Server initialization
		const initMatch = cleanLine.match(/Server initialization in \[(\d+)\] milliseconds/);
		if (initMatch) {
			return `${C.gray}│${C.reset}  ${C.success}●${C.reset} ${C.dim}initialized in ${initMatch[1]}ms${C.reset}`;
		}

		// Starting service [Catalina]
		const serviceMatch = cleanLine.match(/Starting service \[(\w+)\]/);
		if (serviceMatch) {
			return `${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}starting ${serviceMatch[1].toLowerCase()}${C.reset}`;
		}

		// Starting Servlet engine
		if (cleanLine.includes("Starting Servlet engine")) {
			const versionMatch = cleanLine.match(/Apache Tomcat\/([\d.]+)/);
			if (versionMatch) {
				return `${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}Tomcat ${versionMatch[1]}${C.reset}`;
			}
		}

		// Deploy directory
		const deployMatch = cleanLine.match(/deployDirectory.*webapps[\\/]([^'"\]]+)/);
		if (deployMatch) {
			return `${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}deploying ${deployMatch[1]}${C.reset}`;
		}

		// Server startup in ( já temos no summarize mas reforça aqui )
		const startupMatch = cleanLine.match(/Server startup in.*?([\d,]+)\s*ms/);
		if (startupMatch) {
			const time = startupMatch[1].replace(",", "");
			const seconds = (parseInt(time) / 1000).toFixed(1);
			return `${C.gray}│${C.reset}  ${C.success}●${C.reset} ${C.dim}ready in ${C.white}${seconds}s${C.reset}`;
		}

		// Tomcat versão info (sumarizado)
		const tomcatVersionMatch = cleanLine.match(/Server version number:\s+([\d.]+)/);
		if (tomcatVersionMatch) {
			return `${C.gray}│${C.reset}  ${C.dim}Tomcat ${tomcatVersionMatch[1]}${C.reset}`;
		}

		// JVM info sumarizada
		const jvmMatch = cleanLine.match(/JVM Version:\s+([\d._]+)/);
		if (jvmMatch) {
			return `${C.gray}│${C.reset}  ${C.dim}JVM ${jvmMatch[1]}${C.reset}`;
		}

		// Protocol handler init
		const protocolMatch = cleanLine.match(/Initializing ProtocolHandler \["(.+?)"\]/);
		if (protocolMatch) {
			return `${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}${protocolMatch[1]}${C.reset}`;
		}

		// Erros e warnings que passaram pelo filtro
		if (cleanLine.includes("SEVERE") || cleanLine.includes("ERROR")) {
			return `${C.gray}│${C.reset}  ${C.error}✗${C.reset} ${C.gray}${cleanLine.slice(0, 80)}${C.reset}`;
		}

		if (cleanLine.includes("WARNING") || cleanLine.includes("ADVERTÊNCIA")) {
			return `${C.gray}│${C.reset}  ${C.warning}⚠${C.reset} ${C.gray}${cleanLine.slice(0, 80)}${C.reset}`;
		}

		// Outros logs INFO - mostra resumido
		const infoMatch = cleanLine.match(/(?:INFORMAÇÕES|INFO)\s+\[.*?\]\s+(.+)/);
		if (infoMatch) {
			const msg = infoMatch[1].trim();
			if (msg.length > 0 && !this.isTomcatNoise(msg)) {
				return `${C.gray}│${C.reset}  ${C.dim}${msg.slice(0, 70)}${C.reset}`;
			}
		}

		return "";
	}

	// ========== Build Log Formatting (Maven/Gradle) ==========
	
	private static buildNoisePatterns = [
		/^\[INFO\]\s+Scanning for projects/,
		/^\[INFO\]\s+Using the MultiThreadedBuilder/,
		/^\[INFO\]\s+---\s+.*\s+---$/,
		/^\[INFO\]\s+T+E+\s*$/,
		/^\[INFO\]\s+BUILD\s+SUCCESS/i,
		/^\[INFO\]\s+BUILD\s+FAILURE/i,
		/^\[INFO\]\s+Total time:/,
		/^\[INFO\]\s+Finished at:/,
		/^\[INFO\]\s+Final Memory:/,
		/^\[INFO\]\s+http:\/\/cwiki\.apache\.org/,
		/^\[INFO\]\s+-> \[Help 1\]/,
		/^\[INFO\]\s+Re-run Maven using/,
		/^\[INFO\]\s+To see the full stack trace/,
		/^\[INFO\]\s+For more information about the errors/,
		/^\[ERROR\]\s+To see the full stack trace/,
		/^\[ERROR\]\s+Re-run Maven using/,
		/^\[ERROR\]\s+For more information/,
		/^\[ERROR\]\s+-> \[Help 1\]/,
		/^\[WARNING\]\s+It is highly recommended/,
		/^\[WARNING\]\s+For this reason, future Maven/,
		/^\[WARNING\]\s+\[HELP, sysprop:version/,
		/^\[WARNING\]\s+Some problems were encountered/,
		/^\[WARNING\]\s+'dependencies\.dependency/,
		/Building .*war/,
		/from pom\.xml/,
		/\[ war \]/,
		/^\s*$/,
	];

	private static gradleNoisePatterns = [
		/^> Task/,
		/^Download/,
		/^Expiring/,
		/^BUILD/,
		/^\d+ actionable task/,
	];

	static isBuildNoise(line: string): boolean {
		return this.buildNoisePatterns.some(p => p.test(line)) ||
		       this.gradleNoisePatterns.some(p => p.test(line));
	}

	// Acumulador de erro de compilação (para pegar mensagens multi-linha)
	private static pendingError: { file: string; line: string; msg: string } | null = null;
	
	static formatBuildLog(line: string, buildTool: 'maven' | 'gradle' = 'maven'): string {
		const cleanLine = line.trim();
		if (!cleanLine) return "";

		// Maven: [ERROR] /path/file.java:[123,45] error message
		const mavenErrorMatch = cleanLine.match(/^\[ERROR\]\s+(.+\.java):\[(\d+),\d+\]\s*(.+)/);
		if (mavenErrorMatch) {
			const [, file, lineNum, msg] = mavenErrorMatch;
			const shortFile = file.split(/[/\\]/).pop() || file;
			return `${C.gray}│${C.reset}  ${C.error}✗${C.reset} ${C.white}${shortFile}${C.gray}:${lineNum}${C.reset} ${C.error}${msg.slice(0, 60)}${C.reset}`;
		}

		// Maven: [ERROR] COMPILATION ERROR / BUILD FAILURE (título)
		if (cleanLine.match(/^\[(ERROR|INFO)\]\s+(COMPILATION ERROR|BUILD FAILURE)/)) {
			return `${C.gray}│${C.reset}  ${C.error}✗ COMPILATION FAILED${C.reset}`;
		}

		// Maven: [WARNING] 'dependencies.dependency...' 
		if (cleanLine.match(/^\[WARNING\]\s+'dependencies\.dependency/)) {
			const match = cleanLine.match(/'dependencies\.dependency\.[\w:]+'\s+(.+)/);
			if (match) {
				return `${C.gray}│${C.reset}  ${C.warning}⚠${C.reset} ${C.gray}${match[1].slice(0, 60)}${C.reset}`;
			}
		}

		// Maven: [WARNING] The POM for ... is invalid
		const invalidPomMatch = cleanLine.match(/^\[WARNING\]\s+The POM for (.+?) is invalid/);
		if (invalidPomMatch) {
			return `${C.gray}│${C.reset}  ${C.warning}⚠${C.reset} ${C.gray}Invalid POM: ${invalidPomMatch[1].slice(0, 50)}${C.reset}`;
		}

		// Maven: [INFO] Compiling N source files
		const compilingMatch = cleanLine.match(/^\[INFO\]\s+Compiling\s+(\d+)\s+source/);
		if (compilingMatch) {
			return `${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}compiling ${C.white}${compilingMatch[1]}${C.reset} ${C.dim}files${C.reset}`;
		}

		// Maven: [INFO] /path/file.java: Some input files use or override a deprecated API
		const deprecatedMatch = cleanLine.match(/^\[INFO\]\s+(.+\.java):\s+Some input files use (.+)/);
		if (deprecatedMatch) {
			const shortFile = deprecatedMatch[1].split(/[/\\]/).pop() || deprecatedMatch[1];
			const type = deprecatedMatch[2].includes('removal') ? 'deprecated (removal)' : 'deprecated';
			return `${C.gray}│${C.reset}  ${C.warning}⚠${C.reset} ${C.gray}${shortFile} uses ${type}${C.reset}`;
		}

		// Maven: [INFO] Changes detected - recompiling
		if (cleanLine.match(/^\[INFO\]\s+Changes detected/)) {
			return `${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}changes detected, recompiling${C.reset}`;
		}

		// Maven: [INFO] Copying N resources
		const resourcesMatch = cleanLine.match(/^\[INFO\]\s+Copying\s+(\d+)\s+resources?/);
		if (resourcesMatch) {
			return `${C.gray}│${C.reset}  ${C.dim}copying ${C.white}${resourcesMatch[1]}${C.reset} ${C.dim}resources${C.reset}`;
		}

		// Maven: [INFO] Deleting ...
		const deletingMatch = cleanLine.match(/^\[INFO\]\s+Deleting\s+(.+)/);
		if (deletingMatch) {
			return `${C.gray}│${C.reset}  ${C.dim}cleaning target directory${C.reset}`;
		}

		// Maven: [INFO] skip non existing resourceDirectory
		if (cleanLine.match(/^\[INFO\]\s+skip non existing/)) {
			return ""; // Silencia
		}

		// Gradle: > Task :name
		const gradleTaskMatch = cleanLine.match(/^> Task :(.+)/);
		if (gradleTaskMatch) {
			return `${C.gray}│${C.reset}  ${C.primary}▸${C.reset} ${C.dim}${gradleTaskMatch[1]}${C.reset}`;
		}

		// Gradle errors
		const gradleErrorMatch = cleanLine.match(/^(.+\.java):(\d+):\s*(error|warning):\s*(.+)/);
		if (gradleErrorMatch) {
			const [, file, lineNum, level, msg] = gradleErrorMatch;
			const shortFile = file.split(/[/\\]/).pop() || file;
			const icon = level === 'error' ? C.error + '✗' + C.reset : C.warning + '⚠' + C.reset;
			return `${C.gray}│${C.reset}  ${icon} ${C.white}${shortFile}${C.gray}:${lineNum}${C.reset} ${C.error}${msg.slice(0, 60)}${C.reset}`;
		}

		// Se não for nenhum padrão conhecido e não for noise, retorna formatado como info
		if (!this.isBuildNoise(cleanLine)) {
			// Remove prefixos [INFO], [WARNING], [ERROR] genéricos
			const clean = cleanLine.replace(/^\[(INFO|WARNING|ERROR)\]\s*/, '');
			if (clean.length > 0 && !this.isBuildNoise(clean)) {
				return `${C.gray}│${C.reset}  ${C.dim}${clean.slice(0, 70)}${C.reset}`;
			}
		}

		return "";
	}
}
