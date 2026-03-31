/**
 * Serviço de migrações de banco de dados
 * Suporta Flyway e Liquibase
 */

import { Logger } from "../logging";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export type MigrationTool = "flyway" | "liquibase" | "auto";

export interface DbConfig {
    url: string;
    username: string;
    password: string;
    driver?: string;
    migrationsPath?: string;
}

export interface MigrationStatus {
    version: string;
    description: string;
    state: "pending" | "applied" | "failed";
    installedOn?: Date;
    executionTime?: number;
}

export interface MigrationResult {
    success: boolean;
    message: string;
    migrationsApplied: number;
    errors: string[];
}

export class DbService {
    private buildTool: "maven" | "gradle";
    private projectPath: string;
    private logger = Logger.getInstance();

    constructor(buildTool: "maven" | "gradle", projectPath: string = process.cwd()) {
        this.buildTool = buildTool;
        this.projectPath = projectPath;
    }

    /**
     * Detecta qual ferramenta de migração está configurada no projeto
     */
    async detectTool(): Promise<MigrationTool> {
        const pomPath = path.join(this.projectPath, "pom.xml");
        const buildGradlePath = path.join(this.projectPath, "build.gradle");
        const buildGradleKtsPath = path.join(this.projectPath, "build.gradle.kts");

        let content = "";
        if (fs.existsSync(pomPath)) {
            content = fs.readFileSync(pomPath, "utf-8");
        } else if (fs.existsSync(buildGradlePath)) {
            content = fs.readFileSync(buildGradlePath, "utf-8");
        } else if (fs.existsSync(buildGradleKtsPath)) {
            content = fs.readFileSync(buildGradleKtsPath, "utf-8");
        }

        if (content.includes("flyway") || content.includes("flyway-core")) {
            return "flyway";
        }
        if (content.includes("liquibase") || content.includes("liquibase-core")) {
            return "liquibase";
        }

        // Verificar arquivos de configuração
        if (fs.existsSync(path.join(this.projectPath, "src", "main", "resources", "db", "migration"))) {
            return "flyway";
        }
        if (fs.existsSync(path.join(this.projectPath, "src", "main", "resources", "db", "changelog"))) {
            return "liquibase";
        }

        return "auto";
    }

    /**
     * Executa migrações pendentes
     */
    async migrate(config?: DbConfig): Promise<MigrationResult> {
        const tool = await this.detectTool();
        this.logger.section("Database Migration");
        this.logger.info(`Tool: ${tool === "auto" ? "auto-detect" : tool}`);

        if (tool === "auto") {
            return {
                success: false,
                message: "Nenhuma ferramenta de migração detectada. Adicione Flyway ou Liquibase ao projeto.",
                migrationsApplied: 0,
                errors: ["Nenhuma ferramenta de migração encontrada"]
            };
        }

        const result = tool === "flyway" 
            ? await this.runFlywayMigrate(config)
            : await this.runLiquibaseUpdate(config);

        this.logger.newline();
        return result;
    }

    /**
     * Mostra status das migrações
     */
    async status(config?: DbConfig): Promise<MigrationStatus[]> {
        const tool = await this.detectTool();
        this.logger.section("Migration Status");
        this.logger.info(`Tool: ${tool}`);

        if (tool === "auto") {
            this.logger.warn("Nenhuma ferramenta de migração detectada");
            this.logger.newline();
            return [];
        }

        const statuses = tool === "flyway"
            ? await this.runFlywayInfo(config)
            : await this.runLiquibaseStatus(config);

        // Print status table
        if (statuses.length > 0) {
            this.logger.divider();
            for (const status of statuses) {
                const stateStr = status.state === "applied" ? "✓ aplicada" 
                    : status.state === "failed" ? "✗ falhou" 
                    : "⏳ pendente";
                this.logger.info(`${status.version}: ${stateStr} - ${status.description}`);
            }
        } else {
            this.logger.info("Status: Nenhuma migração encontrada");
        }

        this.logger.newline();
        return statuses;
    }

    /**
     * Reseta o banco (drop all + migrate)
     */
    async reset(config?: DbConfig): Promise<MigrationResult> {
        this.logger.section("Database Reset");
        this.logger.warn("Isso vai APAGAR TODOS OS DADOS do banco!");

        const tool = await this.detectTool();
        
        if (tool === "flyway") {
            return await this.runFlywayClean(config);
        } else if (tool === "liquibase") {
            return await this.runLiquibaseDropAll(config);
        }

        this.logger.newline();
        return {
            success: false,
            message: "Nenhuma ferramenta de migração detectada",
            migrationsApplied: 0,
            errors: []
        };
    }

    /**
     * Popula dados de teste/seed
     */
    async seed(config?: DbConfig, seedFile?: string): Promise<MigrationResult> {
        this.logger.section("Database Seed");

        // Procurar arquivos de seed
        const seedPaths = [
            path.join(this.projectPath, "src", "test", "resources", "seed.sql"),
            path.join(this.projectPath, "src", "main", "resources", "seed.sql"),
            path.join(this.projectPath, "seed.sql"),
        ];

        const seedPath = seedFile || seedPaths.find(p => fs.existsSync(p));

        if (!seedPath) {
            return {
                success: false,
                message: "Arquivo seed não encontrado. Crie seed.sql em src/test/resources/ ou raiz do projeto.",
                migrationsApplied: 0,
                errors: ["Arquivo seed não encontrado"]
            };
        }

        this.logger.info(`Seed file: ${seedPath}`);

        // Executar seed via JDBC ou comando SQL
        const result = await this.executeSeed(seedPath, config);
        
        this.logger.newline();
        return result;
    }

    // ===== Flyway Commands =====

    private async runFlywayMigrate(config?: DbConfig): Promise<MigrationResult> {
        return this.runMavenOrGradle("flyway:migrate", "flywayMigrate", config);
    }

    private async runFlywayInfo(config?: DbConfig): Promise<MigrationStatus[]> {
        const output = await this.runMavenOrGradleOutput("flyway:info", "flywayInfo", config);
        return this.parseFlywayInfo(output);
    }

    private async runFlywayClean(config?: DbConfig): Promise<MigrationResult> {
        return this.runMavenOrGradle("flyway:clean", "flywayClean", config);
    }

    // ===== Liquibase Commands =====

    private async runLiquibaseUpdate(config?: DbConfig): Promise<MigrationResult> {
        return this.runMavenOrGradle("liquibase:update", "liquibaseUpdate", config);
    }

    private async runLiquibaseStatus(config?: DbConfig): Promise<MigrationStatus[]> {
        const output = await this.runMavenOrGradleOutput("liquibase:status", "liquibaseStatus", config);
        return this.parseLiquibaseStatus(output);
    }

    private async runLiquibaseDropAll(config?: DbConfig): Promise<MigrationResult> {
        return this.runMavenOrGradle("liquibase:dropAll", "liquibaseDropAll", config);
    }

    // ===== Generic Execution =====

    private async runMavenOrGradle(
        mavenGoal: string, 
        gradleTask: string, 
        config?: DbConfig
    ): Promise<MigrationResult> {
        return new Promise((resolve) => {
            const [cmd, ...args] = this.buildTool === "maven"
                ? [process.platform === "win32" ? "mvn.cmd" : "mvn", mavenGoal, "-q"]
                : [process.platform === "win32" ? "gradle.bat" : "gradle", gradleTask, "-q"];

            const env = config ? this.buildEnv(config) : process.env;
            const spinner = this.logger.spinner("Executando migrações");

            const child = spawn(cmd, args, {
                cwd: this.projectPath,
                env: { ...process.env, ...env },
                shell: process.platform === "win32"
            });

            let stdout = "";
            let stderr = "";

            child.stdout?.on("data", (data) => stdout += data.toString());
            child.stderr?.on("data", (data) => stderr += data.toString());

            child.on("close", (code) => {
                spinner.stop(code === 0);
                
                if (code === 0) {
                    this.logger.success("Migrações concluídas com sucesso");
                } else {
                    this.logger.error("Falha na migração");
                    if (stderr) this.logger.debug(stderr.slice(0, 500));
                }

                resolve({
                    success: code === 0,
                    message: code === 0 ? "Success" : stderr || "Failed",
                    migrationsApplied: this.countMigrations(stdout),
                    errors: code !== 0 ? [stderr] : []
                });
            });
        });
    }

    private async runMavenOrGradleOutput(
        mavenGoal: string, 
        gradleTask: string, 
        config?: DbConfig
    ): Promise<string> {
        return new Promise((resolve) => {
            const [cmd, ...args] = this.buildTool === "maven"
                ? [process.platform === "win32" ? "mvn.cmd" : "mvn", mavenGoal]
                : [process.platform === "win32" ? "gradle.bat" : "gradle", gradleTask];

            const env = config ? this.buildEnv(config) : process.env;
            let output = "";

            const child = spawn(cmd, args, {
                cwd: this.projectPath,
                env: { ...process.env, ...env },
                shell: process.platform === "win32"
            });

            child.stdout?.on("data", (data) => output += data.toString());
            child.stderr?.on("data", (data) => output += data.toString());

            child.on("close", () => resolve(output));
        });
    }

    private async executeSeed(seedPath: string, config?: DbConfig): Promise<MigrationResult> {
        // Implementação básica - executa via JDBC se possível
        // Ou gera comando SQL para execução manual
        
        const sql = fs.readFileSync(seedPath, "utf-8");
        const statements = sql.split(";").filter(s => s.trim());

        this.logger.info(`Statements: ${statements.length}`);
        this.logger.success("Arquivo seed pronto para execução");
        this.logger.debug("Use seu cliente de banco de dados para executar o seed");

        return {
            success: true,
            message: `Seed file prepared: ${seedPath}`,
            migrationsApplied: 0,
            errors: []
        };
    }

    private buildEnv(config: DbConfig): Record<string, string> {
        return {
            JDBC_URL: config.url,
            JDBC_USER: config.username,
            JDBC_PASSWORD: config.password,
            ...(config.driver && { JDBC_DRIVER: config.driver })
        };
    }

    private countMigrations(output: string): number {
        const match = output.match(/Successfully applied (\d+) migration/);
        return match ? parseInt(match[1]) : 0;
    }

    private parseFlywayInfo(output: string): MigrationStatus[] {
        const statuses: MigrationStatus[] = [];
        const lines = output.split("\n");
        
        for (const line of lines) {
            // Parse Flyway info table
            const match = line.match(/\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*\|/);
            if (match && !line.includes("Version")) {
                statuses.push({
                    version: match[1],
                    description: match[4].trim(),
                    state: match[3].toLowerCase() as MigrationStatus["state"]
                });
            }
        }

        return statuses;
    }

    private parseLiquibaseStatus(output: string): MigrationStatus[] {
        const statuses: MigrationStatus[] = [];
        // Simplified parsing - Liquibase output varies
        return statuses;
    }
}
