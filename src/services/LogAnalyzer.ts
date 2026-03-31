import { Logger, Colors } from "../logging";
import type { ProjectConfig } from "../types/config";

export class LogAnalyzer {
    private projectPrefixes: string[] = [];
    private logger = Logger.getInstance();

    constructor(private config: ProjectConfig) {
        // Tentamos inferir prefixos comuns do projeto. 
        // Em Java/Maven/Gradle geralmente começam com com.empresa, br.com.etc
        // Podemos extrair isso do ProjectService se necessário, ou usar o appName como base.
        if (config.appName) {
            this.projectPrefixes.push(config.appName.split('-')[0].toLowerCase());
        }
        // Prefixos padrões que queremos destacar se encontrarmos
        this.projectPrefixes.push("com.xavva"); 
    }

    setProjectPrefixes(prefixes: string[]) {
        this.projectPrefixes = [...new Set([...this.projectPrefixes, ...prefixes])];
    }

    public summarize(line: string): string {
        if (line.includes("CATALINA") || line.includes("Using JRE_HOME") || line.includes("Using CLASSPATH")) return "";

        // Reuso da lógica existente no Logger.summarize, mas aprimorada
        const startupMatch = line.match(/Server startup in (\[?)(.*?)(\]?)\s*ms/);
        if (startupMatch) {
            const time = (parseInt(startupMatch[2]) / 1000).toFixed(1);
            return `${Colors.success}✔ ${Colors.bold}Servidor iniciado em ${time}s`;
        }

        const deployMatch = line.match(/Deployment of web application archive \[(.*?)\] has finished in \[(.*?)\] ms/);
        if (deployMatch) {
            return `${Colors.success}✔ Artefatos implantados`;
        }

        // Smart Folding para Stack Traces
        if (line.trim().startsWith("at ")) {
            return this.formatStackTraceLine(line);
        }

        if (line.includes("Caused by:")) {
            return `${Colors.bgRed}${Colors.white}${Colors.bold} CAUSA RAIZ ${Colors.reset} ${Colors.error}${line.trim()}${Colors.reset}`;
        }

        // Hotswap
        const hotswapPattern = /HOTSWAP AGENT:.*? (INFO|WARN|ERROR|RELOAD) (.*?) - (.*)/;
        const hotswapMatch = line.match(hotswapPattern);
        if (hotswapMatch) {
            return this.formatHotswapLine(hotswapMatch);
        }

        // Tomcat standard logs
        const tomcatPattern = /^(\d{2}-\w{3}-\d{4} \d{2}:\d{2}:\d{2}\.\d{3})\s+(INFO|WARNING|SEVERE|ERROR)\s+\[(.*?)\]\s+(.*)$/;
        const tMatch = line.match(tomcatPattern);
        if (tMatch) {
            return this.formatTomcatLine(tMatch);
        }

        // Generic [LEVEL] logs
        const logPattern = /^\[(INFO|WARNING|WARN|SEVERE|ERROR)\]\s+(.*)$/;
        const match = line.match(logPattern);
        if (match) {
            return this.formatGenericLog(match);
        }

        // Se a linha contém Exception mas não é o 'at ', destaca
        if (line.includes("Exception:")) {
            return `${Colors.error}${Colors.bold}${line.trim()}${Colors.reset}`;
        }

        return "";
    }

    private formatStackTraceLine(line: string): string {
        const trimmed = line.trim();
        const isProject = this.projectPrefixes.some(p => trimmed.includes(p));
        
        if (isProject) {
            return `    ${Colors.bold}${Colors.warning}${trimmed}${Colors.reset}`;
        } else {
            return `    ${Colors.dim}${trimmed}${Colors.reset}`;
        }
    }

    private formatHotswapLine(match: RegExpMatchArray): string {
        const level = match[1];
        let msg = match[3];

        // Ignora mensagens de plugin inicializado (são muito verbosas)
        if (msg.toLowerCase().includes("plugin") && msg.toLowerCase().includes("initialized")) {
            return "";
        }
        
        if (msg.includes("redefinition") || msg.includes("reloaded") || level === 'RELOAD') {
            if (msg.includes("Reloading classes [")) {
                const classes = msg.match(/\[(.*?)\]/)?.[1] || "";
                const classCount = classes.split(",").length;
                if (classCount > 3) msg = `Reloading ${classCount} classes...`;
            }
            return `${Colors.magenta}👀 ${Colors.bold}Hotswap:${Colors.reset} ${msg.replace(/Class '.*?'/, (m) => Colors.bold + m + Colors.reset)}`;
        }

        let color = Colors.primary;
        let symbol = "●";
        if (level === "WARN") { color = Colors.warning; symbol = "▲"; }
        else if (level === "ERROR") { color = Colors.error; symbol = "✖"; }
        
        return `${color}${symbol} ${Colors.bold}Hotswap:${Colors.reset} ${msg}`;
    }

    private formatTomcatLine(match: RegExpMatchArray): string {
        const label = match[2];
        let msg = match[4].trim();
        if (msg.includes("CATALINA") || msg.includes("Using JRE_HOME")) return "";
        
        let color = Colors.dim;
        let symbol = "ℹ";
        if (label === "WARNING") { color = Colors.warning; symbol = "▲"; }
        else if (label === "SEVERE" || label === "ERROR") { color = Colors.error; symbol = "✖"; }
        
        msg = msg.replace(/^(org\.apache|com\.sun|java\..*?|org\.glassfish)\.[a-zA-Z0-9.]+\s/, "").trim();
        if (!msg) return "";
        
        return `${color}${symbol} ${msg}`;
    }

    private formatGenericLog(match: RegExpMatchArray): string {
        const label = match[1];
        let msg = match[2].trim();
        if (msg.includes("Total time:") || msg.includes("Finished at:") || msg.includes("Final Memory:") || msg.includes("-----------------------")) return "";
        
        let color = Colors.dim;
        let symbol = "ℹ";
        if (label === "WARNING" || label === "WARN") { color = Colors.warning; symbol = "▲"; }
        else if (label === "SEVERE" || label === "ERROR") { color = Colors.error; symbol = "✖"; }
        
        msg = msg.replace(/^(org\.apache|com\.sun|java\..*?)\.[a-zA-Z0-9.]+\s/, "").trim();
        if (!msg || msg === "]") return "";
        
        return `${color}${symbol} ${msg}`;
    }
}
