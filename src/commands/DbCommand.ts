/**
 * Comando de migrações de banco de dados
 * xavva db <action> [options]
 */

import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { DbService, type DbConfig } from "../services/DbService";
import { Logger } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";

export class DbCommand implements Command {
    async execute(config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        const processManager = ProcessManager.getInstance();
        const action = positionals?.[1] || "status";
        
        const service = new DbService(config.project.buildTool);

        // Extrair config de DB do environment ou args
        const dbConfig = this.extractDbConfig(config, args);

        try {
            switch (action) {
                case "migrate":
                case "up":
                    const migrateResult = await service.migrate(dbConfig);
                    if (!migrateResult.success) {
                        Logger.error(migrateResult.message);
                        await processManager.shutdown(1);
                    }
                    break;

                case "status":
                case "info":
                    await service.status(dbConfig);
                    break;

                case "reset":
                case "clean":
                case "drop":
                    if (!args?.force) {
                        Logger.warn("This will DELETE all data in the database!");
                        Logger.info("Use", "--force to confirm");
                        await processManager.shutdown(1);
                        return;
                    }
                    const resetResult = await service.reset(dbConfig);
                    if (!resetResult.success) {
                        await processManager.shutdown(1);
                    }
                    // Roda migrações novamente após reset
                    await service.migrate(dbConfig);
                    break;

                case "seed":
                    const seedResult = await service.seed(dbConfig, args?.src);
                    if (!seedResult.success) {
                        Logger.error(seedResult.message);
                        await processManager.shutdown(1);
                    }
                    break;

                case "create":
                    await this.createMigration(service, args);
                    break;

                default:
                    Logger.error(`Unknown db action: ${action}`);
                    Logger.info("Actions", "migrate, status, reset, seed, create");
                    await processManager.shutdown(1);
            }
        } catch (error) {
            Logger.error(`Database command failed: ${(error as Error).message}`);
            await processManager.shutdown(1);
        }
    }

    private extractDbConfig(config: AppConfig, args?: CLIArguments): DbConfig | undefined {
        // Tenta pegar do environment config
        const envName = config.project.environment;
        const envConfig = envName && config.project.environments?.[envName];
        
        if (envConfig?.db) {
            return {
                url: envConfig.db.url || process.env.JDBC_URL || "",
                username: envConfig.db.username || process.env.JDBC_USER || "",
                password: envConfig.db.password || process.env.JDBC_PASSWORD || "",
                driver: envConfig.db.driver
            };
        }

        // Fallback para env vars
        if (process.env.JDBC_URL) {
            return {
                url: process.env.JDBC_URL,
                username: process.env.JDBC_USER || "",
                password: process.env.JDBC_PASSWORD || ""
            };
        }

        return undefined;
    }

    private async createMigration(service: DbService, args?: CLIArguments): Promise<void> {
        const name = args?.name || "new_migration";
        Logger.section("Create Migration");
        Logger.info("Name", name);
        
        // Detecta ferramenta
        const tool = await service.detectTool();
        
        if (tool === "flyway") {
            const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
            const filename = `V${timestamp}__${name}.sql`;
            const filepath = `src/main/resources/db/migration/${filename}`;
            
            Logger.success(`Create file: ${filepath}`);
            Logger.dim("-- Add your SQL here");
        } else if (tool === "liquibase") {
            const filename = `${name}.sql`;
            Logger.success(`Add to changelog: db/changelog/${filename}`);
        } else {
            Logger.warn("No migration tool detected");
        }
    }
}
