import pkg from "../../package.json";

export class Logger {
    public static readonly C = {
        reset: "\x1b[0m",
        cyan: "\x1b[36m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        red: "\x1b[31m",
        dim: "\x1b[90m",
        bold: "\x1b[1m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        bgRed: "\x1b[41m",
        white: "\x1b[37m",
        gray: "\x1b[38;5;240m",
        lightGray: "\x1b[38;5;248m",
        darkGray: "\x1b[38;5;238m"
    };

    private static hotswapPluginsCount = 0;
    private static lastDomain = "";
    private static lastHotswapMsg = "";
    private static activeSpinnerMsg = "";

    private static write(message: string, isError: boolean = false) {
        if (this.activeSpinnerMsg) {
            process.stdout.write("\r\x1B[K"); // Limpa a linha do spinner
        }
        
        if (isError) {
            console.error(message + this.C.reset);
        } else {
            console.log(message + this.C.reset);
        }

        if (this.activeSpinnerMsg) {
            // Re-imprime o início da linha do spinner para o próximo frame
            process.stdout.write(`  ${this.C.cyan}⠋${this.C.reset} ${this.activeSpinnerMsg}...`);
        }
    }

    static getGitContext(): { branch: string, author: string, hash: string } {
        try {
            const branch = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.toString().trim();
            const author = Bun.spawnSync(["git", "log", "-1", "--format=%an"]).stdout.toString().trim();
            const hash = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]).stdout.toString().trim();
            return { branch, author, hash };
        } catch (e) {
            return { branch: "", author: "", hash: "" };
        }
    }

    static banner(command?: string) {
        console.clear();
        const git = this.getGitContext();
        const name = (process.cwd().split(/[/\\]/).pop() || "JAVA").toUpperCase();
        
        const width = 62;
        const line = "─".repeat(width);
        
        this.write(`${this.C.gray}╭${line}╮`);
        this.write(`${this.C.gray}│  ${this.C.bold}${this.C.blue}${name} CLI${this.C.reset}${" ".repeat(width - name.length - 6)} ${this.C.gray}│`);
        
        const info = `Version: ${pkg.version}  |  Branch: ${git.branch}  |  ${git.hash}`;
        this.write(`${this.C.gray}│  ${this.C.dim}${info}${" ".repeat(width - info.length - 2)}${this.C.gray}│`);
        
        const modeLine = `Mode: ${command?.toUpperCase() || "DEPLOY"}`;
        const status = command === 'dev' ? `${this.C.green}🟢` : `${this.C.blue}🔵`;
        this.write(`${this.C.gray}│  ${this.C.yellow}${this.C.bold}${modeLine}${" ".repeat(width - modeLine.length - 5)}${status}   ${this.C.gray}│`);
        this.write(`${this.C.gray}╰${line}╯${this.C.reset}`);
    }

    static section(title: string) {
        this.write(`\n${this.C.bold}${this.C.blue}[${title.toUpperCase()}]${this.C.reset}`);
    }

    private static domain(name: string) {
        if (this.lastDomain !== name) {
            this.write(`\n${this.C.bold}${this.C.blue}[${name.toUpperCase()}]${this.C.reset}`);
            this.lastDomain = name;
        }
    }

    static config(label: string, value: string | number | boolean) {
        this.domain("config");
        this.info(label, value);
    }

    static info(label: string, value: string | number | boolean) {
        this.write(`  ${this.C.lightGray}${label.padEnd(12)}${this.C.reset} : ${this.C.bold}${value}${this.C.reset}`);
    }

    static build(msg: string, status: 'start' | 'success' | 'error' | 'info' = 'success') {
        this.domain("build");
        const symbol = status === 'start' ? `${this.C.blue}▶` : status === 'success' ? `${this.C.green}✔` : status === 'error' ? `${this.C.red}✖` : `${this.C.dim}ℹ`;
        this.write(`  ${symbol} ${this.C.reset}${msg}`);
    }

    static server(msg: string, status: 'start' | 'success' | 'error' | 'info' = 'info') {
        this.domain("server");
        const symbol = status === 'start' ? `${this.C.blue}▶` : status === 'success' ? `${this.C.green}✔` : status === 'error' ? `${this.C.red}✖` : `${this.C.dim}ℹ`;
        this.write(`  ${symbol} ${this.C.reset}${msg}`);
    }

    static health(msg: string, status: 'success' | 'error' | 'warn' = 'success') {
        this.domain("health");
        const symbol = status === 'success' ? `${this.C.green}✔` : status === 'error' ? `${this.C.red}✖` : `${this.C.yellow}⚠`;
        this.write(`  ${symbol} ${this.C.reset}${msg}`);
    }

    static watcher(msg: string, status: 'watch' | 'change' | 'start' | 'success' = 'success') {
        this.domain("watcher");
        const symbol = status === 'watch' ? `${this.C.magenta}👀` : status === 'change' ? `${this.C.yellow}▲` : status === 'start' ? `${this.C.blue}▶` : `${this.C.green}✔`;
        this.write(`  ${symbol} ${this.C.reset}${msg}`);
    }

    static success(msg: string) { this.write(`  ${this.C.green}✔ ${msg}`); }
    static error(msg: string) { this.write(`  ${this.C.red}✖ ${msg}`, true); }
    static warn(msg: string) { this.write(`  ${this.C.yellow}⚠ ${msg}`); }
    static log(msg: string) { this.write(`  ${msg}`); }
    static step(msg: string) { this.write(`  ${this.C.dim}» ${msg}`); }
    static debug(msg: string) { this.write(`  ${this.C.magenta}🐛 ${msg}`); }
    static process(msg: string) { this.write(`  ${this.C.blue}▶ ${msg}`); }
    static newline() { this.write(""); }
    static dim(msg: string) { this.write(`  ${this.C.dim}${msg}${this.C.reset}`); }

    static spinner(msg: string) {
        this.activeSpinnerMsg = msg;
        const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        let i = 0;
        process.stdout.write("\x1B[?25l");
        
        const timer = setInterval(() => {
            process.stdout.write(`\r  ${this.C.cyan}${frames[i]}${this.C.reset} ${msg}...`);
            i = (i + 1) % frames.length;
        }, 80);

        return (success = true) => {
            clearInterval(timer);
            this.activeSpinnerMsg = "";
            process.stdout.write("\r\x1B[K");
            process.stdout.write("\x1B[?25h");
            if (success) {
                this.write(`  ${this.C.green}✔${this.C.reset} ${msg}`);
            } else {
                this.error(`Falha em ${msg}`);
            }
        };
    }

    static isSystemNoise(line: string): boolean {
        const noise = [
            "Using CATALINA_", "Using JRE_HOME", "Using CLASSPATH", "NOTE: Picked up JDK_JAVA_OPTIONS",
            "Command line argument", "VersionLoggerListener", "Scanning for projects...",
            "Building ", "--- ", "+++ ", "DEBUG: ", "org.apache.catalina.startup.VersionLoggerListener",
            "org.apache.catalina.core.AprLifecycleListener", "org.apache.coyote.AbstractProtocol.init",
            "org.apache.catalina.startup.Catalina.load", "Arquivos processados em",
            "org.apache.jasper.servlet.TldScanner.scanJars", "Listening for transport dt_socket",
            "org.apache.catalina.startup.ExpandWar.expand", "org.apache.catalina.startup.ContextConfig.configureStart",
            "SLF4J: ", "org.glassfish.jersey.internal.Errors.logErrors", "contains empty path annotation",
            "org.apache.catalina.core.StandardContext.setPath", "milliseconds",
            "org.apache.catalina.startup.HostConfig.deployWAR", "org.apache.catalina.startup.HostConfig.deployDirectory",
            "Deployment of web application", "Deploying web application archive", "at org.apache",
            "Registering directory"
        ];
        return noise.some(n => line.includes(n));
    }

    static isEssential(line: string): boolean {
        return line.includes("SEVERE") || line.includes("ERROR") || line.includes("Exception") ||
               line.includes("Caused by") || line.includes("at ") || line.includes("... ") ||
               line.includes("Server startup in") || line.includes("HOTSWAP AGENT:");
    }

    static summarize(line: string): string {
        if (this.isSystemNoise(line)) return "";

        const startupMatch = line.match(/Server startup in (\[?)(.*?)(\]?)\s*ms/);
        if (startupMatch) {
            const time = (parseInt(startupMatch[2]) / 1000).toFixed(1);
            this.domain("server");
            return `${this.C.green}✔ ${this.C.bold}Server started in ${time}s`;
        }

        const deployMatch = line.match(/Deployment of web application archive \[(.*?)\] has finished in \[(.*?)\] ms/);
        if (deployMatch) {
            this.domain("build");
            return `${this.C.green}✔ Artifacts deployed`;
        }

        const hotswapPattern = /HOTSWAP AGENT:.*? (INFO|WARN|ERROR|RELOAD) (.*?) - (.*)/;
        const hotswapMatch = line.match(hotswapPattern);
        if (hotswapMatch) {
            const level = hotswapMatch[1];
            let msg = hotswapMatch[3];

            if (msg.includes("plugin initialized")) {
                this.hotswapPluginsCount++;
                return "";
            }

            if (msg.includes("redefinition") || msg.includes("reloaded") || level === 'RELOAD') {
                if (msg.includes("Reloading classes [")) {
                    const classes = msg.match(/\[(.*?)\]/)?.[1] || "";
                    const classCount = classes.split(",").length;
                    if (classCount > 3) msg = `Reloading ${classCount} classes...`;
                }
                
                if (msg === this.lastHotswapMsg) return "";
                this.lastHotswapMsg = msg;

                this.watcher(`Hotswap: ${msg.replace(/Class '.*?'/, (m) => this.C.bold + m + this.C.reset)}`, 'success');
                return "";
            }

            if (msg.includes("Loading Hotswap agent")) {
                this.domain("server");
                return `${this.C.blue}▶ ${this.C.reset}Initializing Hotswap Agent ${msg.match(/\d+\.\d+\.\d+/)?.[0] || ""}`;
            }

            if (this.hotswapPluginsCount > 0) {
                const count = this.hotswapPluginsCount;
                this.hotswapPluginsCount = 0;
                this.domain("server");
                this.write(`  ${this.C.green}✔ ${this.C.reset}Hotswap ready (Plugins: ${count} loaded)`);
            }

            let color = this.C.cyan;
            let symbol = "●";
            if (level === "WARN") { color = this.C.yellow; symbol = "▲"; }
            else if (level === "ERROR") { color = this.C.red; symbol = "✖"; }
            
            this.domain("server");
            return `${color}${symbol} ${this.C.bold}Hotswap:${this.C.reset} ${msg}`;
        }

        if (line.includes("java.lang.UnsupportedOperationException") && (line.includes("add a method") || line.includes("change the schema"))) {
            this.domain("watcher");
            this.write(`  ${this.C.red}✖ ${this.C.bold}Hotswap Falhou:${this.C.reset} Mudança estrutural detectada (novo método/campo).`);
            this.write(`    ${this.C.yellow}💡 Dica: Sua JVM atual não suporta mudar a estrutura da classe. Reinicie o servidor para aplicar.`);
            return "";
        }

        const tomcatPattern = /^(\d{2}-\w{3}-\d{4} \d{2}:\d{2}:\d{2}\.\d{3})\s+(INFO|WARNING|SEVERE|ERROR)\s+\[(.*?)\]\s+(.*)$/;
        const tMatch = line.match(tomcatPattern);
        if (tMatch) {
            const label = tMatch[2];
            let msg = tMatch[4].trim();
            if (this.isSystemNoise(msg)) return "";
            let color = this.C.dim;
            let symbol = "ℹ";
            if (label === "WARNING") { color = this.C.yellow; symbol = "▲"; }
            else if (label === "SEVERE" || label === "ERROR") { color = this.C.red; symbol = "✖"; }
            msg = msg.replace(/^(org\.apache|com\.sun|java\..*?|org\.glassfish)\.[a-zA-Z0-9.]+\s/, "").trim();
            if (!msg) return "";
            return `${color}${symbol} ${msg}`;
        }

        const compilationErrorMatch = line.match(/^\[ERROR\]\s+(.*\.java):\[(\d+),(\d+)\]\s+(.*)$/);
        if (compilationErrorMatch) {
            const [_, filePath, row, col, msg] = compilationErrorMatch;
            const fileName = filePath.split(/[/\\]/).pop();
            return `${this.C.red}✖ ERROR ${this.C.reset}${this.C.dim}em ${this.C.reset}${this.C.bold}${fileName}${this.C.reset}${this.C.dim}:${row}${this.C.reset} ${this.C.red}➜ ${this.C.reset}${msg}`;
        }

        const logPattern = /^\[(INFO|WARNING|WARN|SEVERE|ERROR)\]\s+(.*)$/;
        const match = line.match(logPattern);
        if (match) {
            const label = match[1];
            let msg = match[2].trim();
            if (msg.includes("Total time:") || msg.includes("Finished at:") || msg.includes("Final Memory:") || msg.includes("-----------------------")) return "";
            let color = this.C.dim;
            let symbol = "ℹ";
            if (label === "WARNING") { color = this.C.yellow; symbol = "▲"; }
            else if (label === "SEVERE" || label === "ERROR") { color = this.C.red; symbol = "✖"; }
            msg = msg.replace(/^(org\.apache|com\.sun|java\..*?)\.[a-zA-Z0-9.]+\s/, "").trim();
            if (!msg || msg === "]" || msg.includes("Compilation failure")) return "";
            return `${color}${symbol} ${msg}`;
        }

        if (line.includes("Exception") || line.includes("Caused by") || line.includes("at ")) {
            const trimmed = line.trim();
            const color = (trimmed.includes("org.apache") || trimmed.includes("java.base") || trimmed.includes("sun.reflect")) ? this.C.dim : this.C.yellow;
            return `   ${color}${trimmed}`;
        }

        return "";
    }
}
