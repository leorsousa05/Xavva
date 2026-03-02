import type { AppConfig, CLIArguments } from "../types/config";
import type { Command } from "./Command";
import { Logger } from "../utils/ui";
import { HelpCommand } from "./HelpCommand";

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

    async execute(name: string, config: AppConfig, args: CLIArguments) {
        const command = this.commands.get(name);
        if (!command) {
            Logger.error(`Comando desconhecido: ${name}`);
            await new HelpCommand().execute(config);
            process.exit(1);
        }

        try {
            await command.execute(config, args);
        } catch (error: any) {
            Logger.error(`Erro ao executar comando '${name}': ${error.message}`);
            process.exit(1);
        }
    }
}
