import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import pkg from "../../package.json";

export class HelpCommand implements Command {
    async execute(_config: AppConfig, _args?: CLIArguments): Promise<void> {
        const version = pkg.version;
        
        console.log(`
  ${this.c("cyan", "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")}
  ${this.c("cyan", "▓")}                                              ${this.c("cyan", "▓")}
  ${this.c("cyan", "▓")}   ${this.c("bold", "XAVVA")} ${this.c("dim", `v${version}`)} ${this.c("gray", "— Java/Tomcat Dev CLI")}           ${this.c("cyan", "▓")}
  ${this.c("cyan", "▓")}                                              ${this.c("cyan", "▓")}
  ${this.c("cyan", "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓")}

  ${this.c("yellow", "USAGE")}
    xavva <command> [options]

  ${this.c("yellow", "COMMANDS")}
    ${this.c("green", "dev")}              Start development mode (build + deploy + watch)
    ${this.c("green", "deploy")}           Build and deploy to Tomcat (default)
    ${this.c("green", "build")}            Compile project only
    ${this.c("green", "start")}            Start Tomcat server only
    ${this.c("green", "run")} <class>      Run a Java class with automatic classpath
    ${this.c("green", "debug")} <class>    Debug a Java class (port 5005)
    ${this.c("green", "logs")}             Stream and analyze Tomcat logs
    ${this.c("green", "deps")}             Analyze dependencies (conflicts, updates)
    ${this.c("green", "audit")}            Security audit of JAR files
    ${this.c("green", "doctor")}           Diagnose and fix environment issues
    ${this.c("green", "profiles")}         List available Maven/Gradle profiles
    ${this.c("green", "tomcat")}           Manage embedded Tomcat (install, list, installed, use, status)
    ${this.c("green", "docs")}             Generate endpoint documentation

  ${this.c("yellow", "GENERAL OPTIONS")}
    ${this.c("cyan", "-p, --path")} <path>     Tomcat installation path
    ${this.c("cyan", "-t, --tool")} <tool>     Build tool: maven | gradle
    ${this.c("cyan", "-n, --name")} <name>     Application name (WAR context)
    ${this.c("cyan", "--port")} <port>        Tomcat port (default: 8080)
    ${this.c("cyan", "-P, --profile")} <prof>  Maven/Gradle profile
    ${this.c("cyan", "-e, --encoding")} <enc>  Source encoding (utf8, cp1252)
    
    ${this.c("cyan", "-w, --watch")}          Enable file watching (hot reload)
    ${this.c("cyan", "--tui")}                Interactive dashboard mode
    ${this.c("cyan", "-d, --debug")}          Enable JPDA debugger
    ${this.c("cyan", "--dp")} <port>          Debugger port (default: 5005)
    
    ${this.c("cyan", "-c, --clean")}          Clean before build
    ${this.c("cyan", "-s, --no-build")}       Skip initial build
    ${this.c("cyan", "-q, --quiet")}          Minimal output
    ${this.c("cyan", "-V, --verbose")}        Detailed output
    ${this.c("cyan", "-h, --help")}           Show this help
    ${this.c("cyan", "-v, --version")}        Show version

  ${this.c("yellow", "BUILD OPTIONS")}  ${this.c("dim", "(for deploy, dev, build)")}
    ${this.c("cyan", "-W, --war")}             Generate .war file instead of exploded directory
    ${this.c("cyan", "--cache")}              Use build cache (skip if no changes)

  ${this.c("yellow", "TOMCAT OPTIONS")}  ${this.c("dim", "(for embedded Tomcat)")}
    ${this.c("cyan", "--tomcat-version")} <v>   Tomcat version to install (default: 10.1.52)
    ${this.c("cyan", "-y, --yes")}             Auto-install without confirmation

  ${this.c("yellow", "DEPS OPTIONS")}  ${this.c("dim", "(for xavva deps)")}
    ${this.c("cyan", "--update-safe")}         Update only non-breaking dependencies
    ${this.c("cyan", "--fix")}                 Show fix suggestions for conflicts
    ${this.c("cyan", "--strict")}              Fail on critical conflicts (for CI/CD)
    ${this.c("cyan", "-o, --output")} <file>   Export report as JSON

  ${this.c("yellow", "EXAMPLES")}
    ${this.c("dim", "# Development with hot reload and dashboard")}
    xavva dev --tui --watch

    ${this.c("dim", "# Deploy to specific Tomcat installation")}
    xavva deploy -p /opt/tomcat --port 8081

    ${this.c("dim", "# Build and deploy as .war file")}
    xavva deploy --war

    ${this.c("dim", "# Run a class with debugging")}
    xavva debug com.example.MyClass

    ${this.c("dim", "# Use embedded Tomcat (auto-install)")}
    xavva dev --yes
    xavva dev --tomcat-version 9.0.115

    ${this.c("dim", "# Analyze and update dependencies")}
    xavva deps --verbose
    xavva deps --update-safe

    ${this.c("dim", "# Security audit with auto-fix")}
    xavva audit --fix

    ${this.c("dim", "# Manage embedded Tomcat")}
    xavva tomcat list              # List available versions
    xavva tomcat installed         # List installed versions
    xavva tomcat install 9.0.115   # Install specific version
    xavva tomcat use 9.0.115       # Switch to version for this project
    xavva tomcat status
    xavva tomcat uninstall 9.0.115

  ${this.c("yellow", "CONFIGURATION")}
    Settings are loaded from ${this.c("cyan", "xavva.json")} in the project root:
    
    ${this.c("dim", `{
      "project": {
        "appName": "my-app",
        "buildTool": "maven",
        "tui": true
      },
      "tomcat": {
        "path": "C:/apache-tomcat",
        "port": 8080
      }
    }`)}

  ${this.c("gray", "────────────────────────────────────────────────────────────")}
  ${this.c("gray", "Docs: github.com/leorsousa05/Xavva  |  License: MIT")}
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
        };
        return `${colors[color] || ""}${text}\x1b[0m`;
    }
}
