import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import pkg from "../../package.json";

export class HelpCommand implements Command {
    async execute(_config: AppConfig, _args?: CLIArguments): Promise<void> {
        const v = pkg.version;
        const c = this.c;
        
        console.log(`
 ${c("cyan", "◆")} ${c("bold", "XAVVA")} ${c("dim", `v${v}`)} ${c("gray", "— Java/Tomcat Dev CLI")}

 ${c("yellow", "USAGE")}
   xavva <command> [options]

 ${c("yellow", "CORE COMMANDS")}
   ${c("green", "dev")}        Start dev mode (build + deploy + watch + hot reload)
   ${c("green", "deploy")}     Build and deploy to Tomcat
   ${c("green", "build")}      Compile project
   ${c("green", "start")}      Start Tomcat server
   ${c("green", "run")}        Run a Java class
   ${c("green", "logs")}       Stream Tomcat logs

 ${c("yellow", "ANALYSIS")}
   ${c("cyan", "deps")}        Analyze dependencies (conflicts, updates)
   ${c("cyan", "audit")}       Security vulnerability scan
   ${c("cyan", "doctor")}      Diagnose environment issues
   ${c("cyan", "health")}      Check environment health
   ${c("cyan", "profiles")}    List Maven/Gradle profiles

 ${c("yellow", "UTILITIES")}
   ${c("magenta", "init")}         Initialize project (wizard)
   ${c("magenta", "config")}       View/edit configuration
   ${c("magenta", "encoding")}     Convert file encodings
   ${c("magenta", "tomcat")}       Manage embedded Tomcat
   ${c("magenta", "history")}      Command history
   ${c("magenta", "redo")}         Repeat last command
   ${c("magenta", "completion")}   Shell completions

 ${c("yellow", "NEW v3.1")}
   ${c("brightMagenta", "test")}        Run JUnit/TestNG tests (--watch, --coverage)
   ${c("brightMagenta", "db")}          Database migrations (Flyway/Liquibase)
   ${c("brightMagenta", "http")}        HTTP client for API testing
   ${c("brightMagenta", "docker")}      Docker integration

 ${c("yellow", "GLOBAL OPTIONS")}
   -p, --path <path>      Tomcat path      --port <n>             Port (8080)
   -t, --tool <tool>      maven|gradle     -P, --profile <p>      Build profile
   -n, --name <name>      App name         -e, --encoding <enc>   UTF-8|cp1252
   -w, --watch            Watch mode       --tui                  Dashboard
   -d, --debug            JPDA debugger    -c, --clean            Clean build
   -W, --war              Build .war       --env <name>           Environment
   -h, --help             Show help        -v, --version          Version

 ${c("yellow", "EXAMPLES")}
   xavva dev --tui --watch           # Dev mode with dashboard
   xavva deploy --war --port 8081    # Build WAR for port 8081
   xavva test --watch                # Test watch mode
   xavva deps --update-safe          # Update dependencies
   xavva docker init && xavva docker up   # Docker setup

 ${c("gray", "Run 'xavva <command> --help' for detailed options")}
 ${c("gray", "Docs: github.com/leorsousa05/Xavva")}
`);
    }

    private c(color: string, text: string): string {
        const colors: Record<string, string> = {
            reset: "\x1b[0m",
            bold: "\x1b[1m",
            dim: "\x1b[2m",
            gray: "\x1b[90m",
            red: "\x1b[31m",
            green: "\x1b[32m",
            yellow: "\x1b[33m",
            blue: "\x1b[34m",
            cyan: "\x1b[36m",
            brightMagenta: "\x1b[95m",
        };
        return `${colors[color] || ""}${text}\x1b[0m`;
    }
}
