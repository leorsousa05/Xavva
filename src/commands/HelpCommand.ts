import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import pkg from "../../package.json";
import { Logger } from "../logging";

export class HelpCommand implements Command {
    private logger = Logger.getInstance();

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
   ${c("green", "clean")}      Clean cache, build, and logs
   ${c("green", "run")}        Run a Java class
   ${c("green", "logs")}       Stream Tomcat logs

 ${c("yellow", "ANALYSIS")}
   ${c("cyan", "deps")}        Analyze dependencies (conflicts, updates)
   ${c("cyan", "audit")}       Security vulnerability scan
   ${c("cyan", "doctor")}      Diagnose environment issues
   ${c("cyan", "health")}      Check environment health
   ${c("cyan", "profiles")}    List Maven/Gradle profiles

 ${c("yellow", "UTILITIES")}
   ${c("magenta", "init")}         Initialize project (detects Spring Boot, Maven, Gradle)
   ${c("magenta", "config")}       View/edit configuration
   ${c("magenta", "encoding")}     Convert file encodings
   ${c("magenta", "tomcat")}       Manage embedded Tomcat
   ${c("magenta", "history")}      Command history
   ${c("magenta", "redo")}         Repeat last command
   ${c("magenta", "completion")}   Shell completions

 ${c("yellow", "TESTING & DB")}
   ${c("brightMagenta", "test")}        Run JUnit/TestNG tests
   ${c("brightMagenta", "db")}          Database migrations
   ${c("brightMagenta", "http")}        HTTP client for API testing
   ${c("brightMagenta", "docker")}      Docker integration

 ${c("yellow", "ADVANCED")}
   ${c("blue", "ide")}           Generate IDE config (vscode|idea|eclipse)
   ${c("blue", "docs")}          Generate API documentation
   ${c("blue", "changelog")}     Generate changelog from git

 ${c("yellow", "GLOBAL OPTIONS")}
   -p, --path <path>      Tomcat path         --port <n>             Port (8080)
   -t, --tool <tool>      maven|gradle        -P, --profile <p>      Build profile
   -n, --name <name>      App name            -e, --encoding <enc>   UTF-8|cp1252
   -w, --watch            Watch mode          --tui                  Dashboard mode
   -d, --debug            JPDA debugger       -c, --clean            Clean build
   -W, --war              Build .war          --cache                Use build cache
   --env <name>           Environment         -y, --yes              Auto-install
   --profile              Show performance    --dry-run              Simulate only
   -V, --verbose          Detailed output     -h, --help             Show help
   -v, --version          Show version

 ${c("yellow", "INIT & SETUP")}
   xavva init                             # Initialize project (interactive wizard)
   xavva init --spring-boot               # Detect and configure Spring Boot
   xavva init --execution-mode=embedded   # Use embedded Tomcat

 ${c("yellow", "SPRING BOOT")}
   xavva dev                              # Start Spring Boot with hot-reload
   xavva dev --execution-mode=springboot  # Force Spring Boot mode
   xavva run --main-class=MinhaApp        # Run specific main class

 ${c("yellow", "EXAMPLES")}
   xavva dev --tui --watch                # Dev mode with dashboard
   xavva deploy --war --port 8081         # Build WAR for port 8081
   xavva clean                            # Clean cache and build
   xavva test --watch --coverage          # Test with coverage
   xavva doctor --fix                     # Auto-fix issues
   xavva ide --ide vscode                 # Generate VS Code config
   xavva deps --update-safe               # Update dependencies
   xavva deploy --dry-run                 # Simulate deployment
   xavva build --profile                  # Show performance profile
   xavva docker init && xavva docker up   # Docker setup
   xavva tomcat install 10.1.52 --mirror auto   # Install with best mirror
   xavva tomcat cache stats               # Show download cache stats
   xavva run MinhaClasse --debug --wait 5       # Debug with 5s countdown
   xavva run MinhaClasse --debug --prompt       # Debug, wait for ENTER
   xavva run MinhaClasse --attach-later         # Run then attach debugger
   xavva run MinhaClasse --fast           # Skip compilation check (fast)
   xavva run MinhaClasse --build          # Force recompilation

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
            magenta: "\x1b[35m",
            cyan: "\x1b[36m",
            brightMagenta: "\x1b[95m",
        };
        return `${colors[color] || ""}${text}\x1b[0m`;
    }
}
