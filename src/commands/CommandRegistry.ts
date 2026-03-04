import type { AppConfig, CLIArguments } from "../types/config";
import type { Command } from "./Command";
import { Logger } from "../utils/ui";
import { HelpCommand } from "./HelpCommand";
import { ProcessManager } from "../utils/processManager";

export class CommandRegistry {
    private commands = new Map<string, Command>();

    register(name: string, command: Command) {
        this.commands.set(name, command);
    }

    has(name: string): boolean {
        return this.commands.has(name);
    }

    get(name: string): Command | undefined {
        return this.commands.get(name);
    }

    async execute(name: string, config: AppConfig, args: CLIArguments, positionals?: string[]): Promise<void> {
        const command = this.commands.get(name);
        const processManager = ProcessManager.getInstance();
        
        if (!command) {
            Logger.error(`Comando desconhecido: ${name}`);
            await new HelpCommand().execute(config, args, positionals);
            await processManager.shutdown(2);
        }

        try {
            await command.execute(config, args, positionals);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            Logger.error(`Erro ao executar comando '${name}': ${message}`);
            await processManager.shutdown(1);
        }
    }
}
