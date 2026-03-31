/**
 * Comando de execução de testes
 * xavva test [options] [filter]
 */

import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { TestService } from "../services/TestService";
import { Logger, C } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";

export class TestCommand implements Command {
    private service: TestService | null = null;

    private showHelp(): void {
        Logger.section("Test Runner");
        Logger.log(`${C.bold}Usage:${C.reset} xavva test [options] [filter]`);
        Logger.newline();
        Logger.log(`${C.bold}Options:${C.reset}`);
        Logger.log(`  -w, --watch          Watch mode (run on file change)`);
        Logger.log(`      --coverage       Generate JaCoCo coverage report`);
        Logger.log(`      --fail-fast      Stop on first failure`);
        Logger.log(`      --parallel       Run tests in parallel`);
        Logger.log(`  -V, --verbose        Verbose output`);
        Logger.newline();
        Logger.log(`${C.bold}Examples:${C.reset}`);
        Logger.log(`  xavva test                    # Run all tests`);
        Logger.log(`  xavva test --watch            # Watch mode`);
        Logger.log(`  xavva test --coverage         # With coverage`);
        Logger.log(`  xavva test UserServiceTest    # Run specific test`);
    }

    async execute(config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        const processManager = ProcessManager.getInstance();

        // Mostra help se solicitado
        if (args?.help) {
            this.showHelp();
            return;
        }
        
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
