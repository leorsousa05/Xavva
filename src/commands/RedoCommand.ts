import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { HistoryService } from "../services/HistoryService";
import { Logger, C } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";

export class RedoCommand implements Command {
    private historyService = new HistoryService();

    async execute(_config: AppConfig, _args?: CLIArguments): Promise<void> {
        const lastEntry = await this.historyService.getLast();

        if (!lastEntry) {
            Logger.error("Nenhum comando no histórico");
            return;
        }

        const args = lastEntry.args.length > 0 ? lastEntry.args.join(" ") : "";
        Logger.banner("redo");
        Logger.info(`Repetindo: ${C.white}xavva ${lastEntry.command}${C.reset} ${C.gray}${args}${C.reset}`);
        Logger.newline();

        // Re-executar o comando
        const proc = Bun.spawn([
            "bun", "run", "src/index.ts", 
            lastEntry.command, 
            ...lastEntry.args
        ], {
            stdio: "inherit",
            cwd: process.cwd()
        });

        await proc.exited;
        ProcessManager.getInstance().shutdown(proc.exitCode || 0);
    }
}
