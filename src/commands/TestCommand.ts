/**
 * Comando de execução de testes
 * xavva test [options] [filter]
 */

import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { TestService } from "../services/TestService";
import { Logger } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";

export class TestCommand implements Command {
    private service: TestService | null = null;

    async execute(config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        const processManager = ProcessManager.getInstance();
        
        // Extrai filtros de teste dos positionals (após o comando "test")
        const filter = positionals?.slice(1).join(" ") || undefined;
        
        // Opções
        const watch = args?.watch || false;
        const coverage = args?.coverage || false;
        const verbose = args?.verbose || false;
        const failFast = args?.["fail-fast"] || false;
        const parallel = args?.parallel || false;

        this.service = new TestService(config.project.buildTool);

        try {
            if (watch) {
                this.service.startWatch({
                    coverage,
                    filter,
                    verbose,
                    failFast,
                    parallel
                });

                // Mantém processo rodando
                process.on("SIGINT", () => {
                    this.service?.stopWatch();
                    processManager.shutdown(0);
                });
            } else {
                const result = await this.service.runTests({
                    coverage,
                    filter,
                    verbose,
                    failFast,
                    parallel
                });

                if (!result.success) {
                    await processManager.shutdown(1);
                }
            }
        } catch (error) {
            Logger.error(`Test execution failed: ${(error as Error).message}`);
            await processManager.shutdown(1);
        }
    }
}
