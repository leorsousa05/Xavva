import pkg from "../../package.json";

export class Logger {
    private static readonly C = {
        reset: "\x1b[0m",
        cyan: "\x1b[36m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        red: "\x1b[31m",
        dim: "\x1b[90m",
        bold: "\x1b[1m",
        blue: "\x1b[34m"
    };

    static getGitContext(): string {
        try {
            const branch = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.toString().trim();
            const author = Bun.spawnSync(["git", "log", "-1", "--format=%an"]).stdout.toString().trim();
            return branch ? `${this.C.blue} ${branch}${this.C.reset} ${this.C.dim}(${author})${this.C.reset}` : "";
        } catch (e) {
            return "";
        }
    }

    static banner(command?: string) {
        console.clear();
        const git = this.getGitContext();
        console.log(`${this.C.cyan}
  ${this.C.bold}XAVVA ${this.C.reset}${this.C.dim}v${pkg.version}${this.C.reset} ${git}
  ${this.C.dim}──────────────────────────${this.C.reset}`);
        if (command) {
            console.log(`  ${this.C.yellow}${this.C.bold}MODO: ${command.toUpperCase()}${this.C.reset}\n`);
        }
    }

    static section(title: string) {
        console.log(`\n  ${this.C.bold}${this.C.blue}◈ ${title.toUpperCase()} ${this.C.reset}`);
        console.log(`  ${this.C.dim}──────────────────────────${this.C.reset}`);
    }

    static info(label: string, value: string | number | boolean) {
        console.log(`  ${this.C.cyan}${label.padEnd(12)}${this.C.reset} ${this.C.bold}${value}${this.C.reset}`);
    }

    static success(msg: string) {
        console.log(`\n  ${this.C.green}✔ ${msg}${this.C.reset}`);
    }

    static error(msg: string) {
        console.error(`\n  ${this.C.red}✘ ${msg}${this.C.reset}`);
    }

    static warn(msg: string) {
        console.log(`  ${this.C.yellow}⚠ ${msg}${this.C.reset}`);
    }

    static log(msg: string) {
        console.log(`  ${msg}`);
    }

    static step(msg: string) {
        console.log(`  ${this.C.dim}➜ ${msg}${this.C.reset}`);
    }

    static spinner(msg: string) {
        const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        let i = 0;
        process.stdout.write("\x1B[?25l");
        
        const timer = setInterval(() => {
            process.stdout.write(`\r  ${this.C.cyan}${frames[i]}${this.C.reset} ${msg}...`);
            i = (i + 1) % frames.length;
        }, 80);

        return (success = true) => {
            clearInterval(timer);
            process.stdout.write("\r\x1B[K");
            process.stdout.write("\x1B[?25h");
            if (success) {
                console.log(`  ${this.C.green}✔${this.C.reset} ${msg}`);
            }
        };
    }

    static isSystemNoise(line: string): boolean {
        const noise = [
            "Using CATALINA_",
            "Using JRE_HOME",
            "Using CLASSPATH",
            "NOTE: Picked up JDK_JAVA_OPTIONS",
            "Command line argument",
            "VersionLoggerListener",
            "Scanning for projects...",
            "Building ",
            "--- ",
            "+++ ",
            "DEBUG: ",
            "org.apache.catalina.startup.VersionLoggerListener",
            "org.apache.catalina.core.AprLifecycleListener",
            "org.apache.coyote.AbstractProtocol.init",
            "org.apache.catalina.startup.Catalina.load",
            "Arquivos processados em",
            "org.apache.jasper.servlet.TldScanner.scanJars",
            "Listening for transport dt_socket",
            "org.apache.catalina.startup.ExpandWar.expand",
            "org.apache.catalina.startup.ContextConfig.configureStart",
            "SLF4J: ",
            "org.glassfish.jersey.internal.Errors.logErrors",
            "contains empty path annotation",
            "org.apache.catalina.core.StandardContext.setPath",
            "milliseconds"
        ];
        return noise.some(n => line.includes(n));
    }

    static isEssential(line: string): boolean {
        return line.includes("SEVERE") || 
               line.includes("ERROR") || 
               line.includes("Exception") ||
               line.includes("Caused by") ||
               line.includes("at ") ||
               line.includes("... ") ||
               line.includes("Server startup in");
    }

    static summarize(line: string): string {
        const startupMatch = line.match(/Server startup in (\[?)(.*?)(\]?)\s*ms/);
        if (startupMatch) {
            const time = startupMatch[2] || "???";
            return `\n  ${this.C.green}${this.C.bold}🚀 TOMCAT PRONTO EM ${time}ms${this.C.reset}\n`;
        }

        if (line.match(/^\[(INFO|WARN|ERROR)\]\s*$/) || line.includes("--- maven-") || line.includes("--- bpo-")) return "";
        if (line.includes("Scanning for projects...") || line.includes("Building bpo-consig") || line.includes("--- ")) return "";

        const compilationErrorMatch = line.match(/^\[ERROR\]\s+(.*\.java):\[(\d+),(\d+)\]\s+(.*)$/);
        if (compilationErrorMatch) {
            const [_, filePath, row, col, msg] = compilationErrorMatch;
            const fileName = filePath.split(/[/\\]/).pop();
            
            let contextTip = "";
            if (msg.includes("unmappable character") || msg.includes("encoding")) {
                contextTip = `\n      ${this.C.yellow}💡 Dica: Erro de encoding detectado. O arquivo parece usar um charset (como UTF-8) diferente do configurado no Maven.${this.C.reset}`;
            } else if (msg.includes("illegal character")) {
                contextTip = `\n      ${this.C.yellow}💡 Dica: Caractere invisível ou inválido. Tente remover espaços ou quebras de linha estranhas no topo do arquivo.${this.C.reset}`;
            } else if (msg.includes("cannot find symbol")) {
                contextTip = `\n      ${this.C.yellow}💡 Dica: Símbolo não encontrado. Verifique se o import está correto ou se a dependência existe.${this.C.reset}`;
            }

            return `  ${this.C.red}${this.C.bold}✖ ERROR ${this.C.reset}${this.C.dim}em ${this.C.reset}${this.C.bold}${fileName}${this.C.reset}${this.C.dim}:${row}${this.C.reset}\n    ${this.C.red}➜ ${this.C.reset}${msg}${contextTip}\n`;
        }

        const logPattern = /^\[(INFO|WARNING|WARN|SEVERE|ERROR)\]\s+(.*)$/;
        const match = line.match(logPattern);

        if (match) {
            const label = match[1];
            let msg = match[2];

            if (msg.includes("Total time:") || msg.includes("Finished at:") || msg.includes("Final Memory:") || msg.includes("-----------------------")) return "";

            let color = "";
            let prefix = "";

            if (label === "INFO") { 
                color = this.C.dim; 
                prefix = "ℹ"; 
            } else if (label === "WARNING" || label === "WARN") { 
                color = this.C.yellow; 
                prefix = "⚠"; 
            } else if (label === "SEVERE" || label === "ERROR") { 
                color = this.C.red; 
                prefix = "✘"; 
            }

            msg = msg.replace(/^(org\.apache|com\.sun|java\..*?)\.[a-zA-Z0-9.]+\s/, "").trim();
            if (!msg || msg === "]" || msg.includes("Compilation failure")) return "";

            return `  ${color}${prefix} ${msg}${this.C.reset}`;
        }

        if (line.includes("Exception") || line.includes("at ") || line.includes("Caused by")) {
            const trimmed = line.trim();
            if (trimmed.includes("org.apache") || trimmed.includes("java.base") || trimmed.includes("sun.reflect")) {
                return `     ${this.C.dim}${trimmed}${this.C.reset}`;
            }
            return `     ${this.C.yellow}${trimmed}${this.C.reset}`;
        }

        return "";
    }
}
