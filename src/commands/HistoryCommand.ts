import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { HistoryService } from "../services/HistoryService";
import { Logger, C } from "../utils/ui";

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
                ? `${C.success}✓${C.reset}` 
                : `${C.error}✗${C.reset}`;
            
            const args = entry.args.length > 0 ? entry.args.join(" ") : "";
            const duration = entry.duration ? `${C.gray}(${entry.duration.toFixed(1)}s)${C.reset}` : "";
            
            Logger.log(`${C.gray}│${C.reset}  ${C.dim}${time}${C.reset} ${icon} ${C.white}xavva ${entry.command}${C.reset} ${C.gray}${args}${C.reset} ${duration}`);
        }

        Logger.endSection();
        Logger.info(`Total: ${stats.total} | Sucesso: ${stats.successful} | Falha: ${stats.failed}`);
        Logger.dim("Use 'xavva redo' para repetir o último comando");
    }
}
