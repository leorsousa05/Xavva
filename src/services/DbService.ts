/**
 * Serviço de migrações de banco de dados
 * Suporta Flyway e Liquibase
 */

import { Logger } from "../utils/ui";
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
        Logger.section("Database Migration");
        Logger.info("Tool", tool === "auto" ? "auto-detect" : tool);

        if (tool === "auto") {
            return {
                success: false,
                message: "No migration tool detected. Please add Flyway or Liquibase to your project.",
                migrationsApplied: 0,
                errors: ["No migration tool found"]
            };
        }

        const result = tool === "flyway" 
            ? await this.runFlywayMigrate(config)
            : await this.runLiquibaseUpdate(config);

        Logger.endSection();
        return result;
    }

    /**
     * Mostra status das migrações
     */
    async status(config?: DbConfig): Promise<MigrationStatus[]> {
        const tool = await this.detectTool();
        Logger.section("Migration Status");
        Logger.info("Tool", tool);

        if (tool === "auto") {
            Logger.warn("No migration tool detected");
            Logger.endSection();
            return [];
        }

        const statuses = tool === "flyway"
            ? await this.runFlywayInfo(config)
            : await this.runLiquibaseStatus(config);

        // Print status table
        if (statuses.length > 0) {
            Logger.divider();
            for (const status of statuses) {
                const stateColor = status.state === "applied" ? Logger.C.success 
                    : status.state === "failed" ? Logger.C.error 
                    : Logger.C.warning;
                Logger.info(status.version, `${stateColor}${status.state}${Logger.C.reset} - ${status.description}`);
            }
        } else {
            Logger.info("Status", "No migrations found");
        }

        Logger.endSection();
        return statuses;
    }

    /**
     * Reseta o banco (drop all + migrate)
     */
    async reset(config?: DbConfig): Promise<MigrationResult> {
        Logger.section("Database Reset");
        Logger.warn("This will DROP ALL DATA in the database!");

        const tool = await this.detectTool();
        
        if (tool === "flyway") {
            return await this.runFlywayClean(config);
        } else if (tool === "liquibase") {
            return await this.runLiquibaseDropAll(config);
        }

        Logger.endSection();
        return {
            success: false,
            message: "No migration tool detected",
            migrationsApplied: 0,
            errors: []
        };
    }

    /**
     * Popula dados de teste/seed
     */
    async seed(config?: DbConfig, seedFile?: string): Promise<MigrationResult> {
        Logger.section("Database Seed");

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
                message: "No seed file found. Create seed.sql in src/test/resources/ or project root.",
                migrationsApplied: 0,
                errors: ["Seed file not found"]
            };
        }

        Logger.info("Seed file", seedPath);

        // Executar seed via JDBC ou comando SQL
        const result = await this.executeSeed(seedPath, config);
        
        Logger.endSection();
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
            const spinner = Logger.spinner("Running migrations");

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
                spinner(code === 0);
                
                if (code === 0) {
                    Logger.success("Migrations completed successfully");
                } else {
                    Logger.error("Migration failed");
                    if (stderr) Logger.dim(stderr.slice(0, 500));
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

        Logger.info("Statements", statements.length);
        Logger.success("Seed file ready for execution");
        Logger.dim("Use your database client to execute the seed file");

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
