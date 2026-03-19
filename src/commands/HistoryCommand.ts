import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { HistoryService } from "../services/HistoryService";
import { Logger } from "../utils/ui";

export class HistoryCommand implements Command {
    private historyService = new HistoryService();

    async execute(_config: AppConfig, args?: CLIArguments): Promise<void> {
        const clear = args?.["clear"] || false;
        const limit = parseInt(String(args?.["limit"] || "10"));

        if (clear) {
            await this.historyService.clear();
            Logger.success("Histórico limpo!");
            return;
        }

        const entries = await this.historyService.getRecent(limit);
        const stats = await this.historyService.getStats();

        Logger.banner("history");
        Logger.section(`Últimos ${entries.length} comandos`);

        if (entries.length === 0) {
            Logger.dim("Nenhum comando no histórico");
            Logger.endSection();
            return;
        }

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const date = new Date(entry.timestamp);
            const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            const icon = entry.success 
                ? `${Logger.C.success}✓${Logger.C.reset}` 
                : `${Logger.C.error}✗${Logger.C.reset}`;
            
            const args = entry.args.length > 0 ? entry.args.join(" ") : "";
            const duration = entry.duration ? `${Logger.C.gray}(${entry.duration.toFixed(1)}s)${Logger.C.reset}` : "";
            
            Logger.log(`${Logger.C.gray}│${Logger.C.reset}  ${Logger.C.dim}${time}${Logger.C.reset} ${icon} ${Logger.C.white}xavva ${entry.command}${Logger.C.reset} ${Logger.C.gray}${args}${Logger.C.reset} ${duration}`);
        }

        Logger.endSection();
        Logger.info(`Total: ${stats.total} | Sucesso: ${stats.successful} | Falha: ${stats.failed}`);
        Logger.dim("Use 'xavva redo' para repetir o último comando");
    }
}
