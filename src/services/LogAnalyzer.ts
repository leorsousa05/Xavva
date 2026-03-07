import { Logger } from "../utils/ui";
import type { ProjectConfig } from "../types/config";

export class LogAnalyzer {
    private projectPrefixes: string[] = [];

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
        if (Logger.isSystemNoise(line)) return "";

        // Reuso da lógica existente no Logger.summarize, mas aprimorada
        const startupMatch = line.match(/Server startup in (\[?)(.*?)(\]?)\s*ms/);
        if (startupMatch) {
            const time = (parseInt(startupMatch[2]) / 1000).toFixed(1);
            return `${Logger.C.green}✔ ${Logger.C.bold}Server started in ${time}s`;
        }

        const deployMatch = line.match(/Deployment of web application archive \[(.*?)\] has finished in \[(.*?)\] ms/);
        if (deployMatch) {
            return `${Logger.C.green}✔ Artifacts deployed`;
        }

        // Smart Folding para Stack Traces
        if (line.trim().startsWith("at ")) {
            return this.formatStackTraceLine(line);
        }

        if (line.includes("Caused by:")) {
            return `${Logger.C.bgRed}${Logger.C.white}${Logger.C.bold} ROOT CAUSE ${Logger.C.reset} ${Logger.C.red}${line.trim()}${Logger.C.reset}`;
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
            return `${Logger.C.red}${Logger.C.bold}${line.trim()}${Logger.C.reset}`;
        }

        return "";
    }

    private formatStackTraceLine(line: string): string {
        const trimmed = line.trim();
        const isProject = this.projectPrefixes.some(p => trimmed.includes(p));
        
        if (isProject) {
            return `    ${Logger.C.bold}${Logger.C.warning}${trimmed}${Logger.C.reset}`;
        } else {
            return `    ${Logger.C.dim}${trimmed}${Logger.C.reset}`;
        }
    }

    private formatHotswapLine(match: RegExpMatchArray): string {
        const level = match[1];
        let msg = match[3];

        if (msg.includes("plugin initialized")) return "";
        
        if (msg.includes("redefinition") || msg.includes("reloaded") || level === 'RELOAD') {
            if (msg.includes("Reloading classes [")) {
                const classes = msg.match(/\[(.*?)\]/)?.[1] || "";
                const classCount = classes.split(",").length;
                if (classCount > 3) msg = `Reloading ${classCount} classes...`;
            }
            return `${Logger.C.magenta}👀 ${Logger.C.bold}Hotswap:${Logger.C.reset} ${msg.replace(/Class '.*?'/, (m) => Logger.C.bold + m + Logger.C.reset)}`;
        }

        let color = Logger.C.primary;
        let symbol = "●";
        if (level === "WARN") { color = Logger.C.warning; symbol = "▲"; }
        else if (level === "ERROR") { color = Logger.C.red; symbol = "✖"; }
        
        return `${color}${symbol} ${Logger.C.bold}Hotswap:${Logger.C.reset} ${msg}`;
    }

    private formatTomcatLine(match: RegExpMatchArray): string {
        const label = match[2];
        let msg = match[4].trim();
        if (Logger.isSystemNoise(msg)) return "";
        
        let color = Logger.C.dim;
        let symbol = "ℹ";
        if (label === "WARNING") { color = Logger.C.warning; symbol = "▲"; }
        else if (label === "SEVERE" || label === "ERROR") { color = Logger.C.red; symbol = "✖"; }
        
        msg = msg.replace(/^(org\.apache|com\.sun|java\..*?|org\.glassfish)\.[a-zA-Z0-9.]+\s/, "").trim();
        if (!msg) return "";
        
        return `${color}${symbol} ${msg}`;
    }

    private formatGenericLog(match: RegExpMatchArray): string {
        const label = match[1];
        let msg = match[2].trim();
        if (msg.includes("Total time:") || msg.includes("Finished at:") || msg.includes("Final Memory:") || msg.includes("-----------------------")) return "";
        
        let color = Logger.C.dim;
        let symbol = "ℹ";
        if (label === "WARNING" || label === "WARN") { color = Logger.C.warning; symbol = "▲"; }
        else if (label === "SEVERE" || label === "ERROR") { color = Logger.C.red; symbol = "✖"; }
        
        msg = msg.replace(/^(org\.apache|com\.sun|java\..*?)\.[a-zA-Z0-9.]+\s/, "").trim();
        if (!msg || msg === "]" || msg.includes("Compilation failure")) return "";
        
        return `${color}${symbol} ${msg}`;
    }
}
