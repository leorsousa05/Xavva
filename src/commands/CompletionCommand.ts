import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger, C } from "../utils/ui";

export class CompletionCommand implements Command {
    private readonly commands = [
        "init", "config", "build", "deploy", "start", "stop", "restart",
        "logs", "run", "audit", "deps", "docs", "doctor", "profiles",
        "tomcat", "encoding", "history", "redo", "health", "completion", "help"
    ];

    private readonly flags: Record<string, string[]> = {
        "*": ["--help", "--version", "-v", "--verbose", "--quiet", "-q"],
        "init": [],
        "config": ["--interactive", "-i"],
        "build": ["--clean", "-c", "--profile", "-p", "--no-build", "--cache"],
        "deploy": ["--watch", "-w", "--clean", "-c", "--profile", "-p", "--debug", "--tui"],
        "start": ["--debug", "--tui"],
        "stop": [],
        "restart": ["--debug"],
        "logs": ["--grep", "-g", "--follow", "-f"],
        "run": [],
        "audit": ["--fix", "--strict"],
        "deps": ["--output", "-o"],
        "docs": [],
        "doctor": [],
        "profiles": [],
        "tomcat": ["--tomcat-version", "--tomcat-action"],
        "encoding": ["--from", "--to", "--backup"],
        "history": ["--clear", "--limit"],
        "redo": [],
        "health": [],
        "completion": ["bash", "zsh", "fish"]
    };

    async execute(_config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        const shell = positionals?.[0] || "bash";

        switch (shell) {
            case "bash":
                console.log(this.generateBash());
                break;
            case "zsh":
                console.log(this.generateZsh());
                break;
            case "fish":
                console.log(this.generateFish());
                break;
            default:
                Logger.banner("completion");
                Logger.section("Shell Completion");
                Logger.info("Uso: xavva completion <shell>");
                Logger.newline();
                Logger.log(`${C.gray}│${C.reset}  ${C.primary}xavva completion bash${C.reset}  ${C.gray}# Bash${C.reset}`);
                Logger.log(`${C.gray}│${C.reset}  ${C.primary}xavva completion zsh${C.reset}   ${C.gray}# Zsh${C.reset}`);
                Logger.log(`${C.gray}│${C.reset}  ${C.primary}xavva completion fish${C.reset}  ${C.gray}# Fish${C.reset}`);
                Logger.endSection();
                Logger.dim("Adicione ao seu shell:");
                Logger.log(`  ${C.gray}# Bash: echo 'eval "$(xavva completion bash)"' >> ~/.bashrc${C.reset}`);
                Logger.log(`  ${C.gray}# Zsh:  echo 'eval "$(xavva completion zsh)"' >> ~/.zshrc${C.reset}`);
                Logger.log(`  ${C.gray}# Fish: xavva completion fish > ~/.config/fish/completions/xavva.fish${C.reset}`);
        }
    }

    private generateBash(): string {
        const cmds = this.commands.join(" ");
        const flagCases = Object.entries(this.flags)
            .filter(([cmd]) => cmd !== "*")
            .map(([cmd, flags]) => `
            ${cmd})
                opts="${flags.join(" ")}"
                ;;`)
            .join("");

        return `# xavva completion for bash
_xavva_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    
    # Comandos principais
    local commands="${cmds}"
    local global_flags="${this.flags["*"].join(" ")}"
    
    # Primeiro argumento: comandos
    if [ \${COMP_CWORD} -eq 1 ]; then
        COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )
        return 0
    fi
    
    # Flags específicas por comando
    local cmd="\${COMP_WORDS[1]}"
    case \${cmd} in${flagCases}
            *)
                opts="\${global_flags}"
                ;;
    esac
    
    if [[ \${cur} == -* ]]; then
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
    fi
}

complete -F _xavva_completion xavva
`;
    }

    private generateZsh(): string {
        const cmds = this.commands.map(c => `"${c}"`).join(" ");
        
        return `#compdef xavva

# xavva completion for zsh

_xavva() {
    local curcontext="$curcontext" state line
    typeset -A opt_args

    _arguments -C \\
        '1: :_xavva_commands' \\
        '*:: :->args'

    case $line[1] in
        config)
            _arguments \\
                '(-i --interactive)'{-i,--interactive}'[Modo interativo]'
            ;;
        build)
            _arguments \\
                '(-c --clean)'{-c,--clean}'[Clean build]' \\
                '(-p --profile)'{-p,--profile}'[Profile]:profile:(dev test prod)' \\
                '--cache[Enable cache]'
            ;;
        deploy)
            _arguments \\
                '(-w --watch)'{-w,--watch}'[Watch mode]' \\
                '(-c --clean)'{-c,--clean}'[Clean build]' \\
                '(-p --profile)'{-p,--profile}'[Profile]:profile:(dev test prod)' \\
                '--debug[Debug mode]' \\
                '--tui[Enable TUI]'
            ;;
        logs)
            _arguments \\
                '(-g --grep)'{-g,--grep}'[Filter pattern]:pattern:' \\
                '(-f --follow)'{-f,--follow}'[Follow mode]'
            ;;
        history)
            _arguments \\
                '--clear[Clear history]' \\
                '--limit[Limit entries]:number:'
            ;;
        completion)
            _arguments \\
                '1:shell:(bash zsh fish)'
            ;;
    esac
}

_xavva_commands() {
    local commands=(${cmds})
    _describe -t commands 'xavva commands' commands
}

compdef _xavva xavva
`;
    }

    private generateFish(): string {
        const lines: string[] = [
            "# xavva completion for fish",
            "",
            `# Comandos principais`,
            `complete -c xavva -n "not __fish_seen_subcommand_from ${this.commands.join(" ")}" -a "${this.commands.join(" ")}"`,
            "",
            `# Flags globais`,
        ];

        // Global flags
        for (const flag of this.flags["*"]) {
            const short = flag.startsWith("-") && flag.length === 2 ? flag : "";
            const long = flag.startsWith("--") ? flag : "";
            if (short && long) {
                lines.push(`complete -c xavva -s ${short[1]} -l ${long.slice(2)}`);
            } else if (short) {
                lines.push(`complete -c xavva -s ${short[1]}`);
            } else if (long) {
                lines.push(`complete -c xavva -l ${long.slice(2)}`);
            }
        }

        // Command-specific flags
        for (const [cmd, flags] of Object.entries(this.flags)) {
            if (cmd === "*") continue;
            
            lines.push("");
            lines.push(`# ${cmd}`);
            for (const flag of flags) {
                if (flag.startsWith("--")) {
                    lines.push(`complete -c xavva -n "__fish_seen_subcommand_from ${cmd}" -l ${flag.slice(2)}`);
                } else if (flag.startsWith("-") && flag.length === 2) {
                    lines.push(`complete -c xavva -n "__fish_seen_subcommand_from ${cmd}" -s ${flag[1]}`);
                } else {
                    lines.push(`complete -c xavva -n "__fish_seen_subcommand_from ${cmd}" -a "${flag}"`);
                }
            }
        }

        return lines.join("\n");
    }
}
