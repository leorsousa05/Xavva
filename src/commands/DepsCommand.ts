import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import type { DependencyAnalysisResult } from "../services/DependencyAnalyzerService";
import { DependencyAnalyzerService } from "../services/DependencyAnalyzerService";
import { AuditService } from "../services/AuditService";
import { Logger } from "../logging";
import { ProcessManager } from "../utils/processManager";
import fs from "fs";
import path from "path";

export class DepsCommand implements Command {
    private logger = Logger.getInstance();
    private config!: AppConfig;

    async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
        this.config = config;
        const analyzer = new DependencyAnalyzerService(config.project);
        analyzer.setVerbose(!!args?.verbose);

        this.logger.section("Análise de Dependências");
        this.logger.config("Ferramenta", config.project.buildTool.toUpperCase());
        this.logger.config("Diretório", process.cwd());
        
        const spinner = this.logger.spinner("Analisando dependências...");
        
        try {
            const result = await analyzer.analyze();
            spinner.stop();

            // Se não encontrou dependências, mostrar ajuda
            if (result.dependencies.length === 0) {
                this.logger.warn("Nenhuma dependência encontrada!");
                this.logger.info("Possíveis causas:");
                console.log("  • Projeto não foi compilado ainda (execute: mvn compile)");
                console.log("  • Maven não está no PATH");
                console.log("  • Arquivo pom.xml/build.gradle não encontrado");
                console.log("  • Erro de parsing no arquivo de configuração");
                this.logger.newline();
                console.log(`Dica: Execute com --verbose para mais detalhes`);
                return;
            }

            // Verificar vulnerabilidades se solicitado
            if (args?.["scan"] !== false) {
                this.logger.step("Verificando vulnerabilidades");
                // Integração com AuditService para check de vulnerabilidades
                // nas dependências do projeto
            }

            // Exibir relatório
            const report = analyzer.generateReport(result);
            console.log(report);

            // Ações adicionais baseadas em flags
            if (args?.["update-safe"] || args?.["updateSafe"]) {
                await this.performUpdateSafe(analyzer, result, config.project.buildTool);
            }

            if (args?.["fix"]) {
                await this.suggestFixes(result, config.project.buildTool);
            }

            // Exportar resultado se solicitado
            if (args?.["output"]) {
                this.exportReport(result, args["output"] as string);
            }

            // Sair com erro se houver conflitos críticos
            const hasErrors = result.conflicts.some(c => c.severity === "error");
            if (hasErrors && args?.["strict"]) {
                await ProcessManager.getInstance().shutdown(1);
            }

        } catch (error) {
            spinner.stop(false);
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Falha na análise: ${message}`);
            throw error;
        }
    }

    private async suggestFixes(result: DependencyAnalysisResult, buildTool: string): Promise<void> {
        if (result.conflicts.length === 0) {
            this.logger.success("Nenhum conflito para resolver!");
            return;
        }

        this.logger.newline();
        this.logger.section("Sugestões de Correção");

        for (const conflict of result.conflicts) {
            console.log(`\n${conflict.groupId}:${conflict.artifactId}`);
            
            if (buildTool === "maven") {
                console.log("  Adicione ao pom.xml:");
                console.log(`  <dependencyManagement>`);
                console.log(`    <dependencies>`);
                console.log(`      <dependency>`);
                console.log(`        <groupId>${conflict.groupId}</groupId>`);
                console.log(`        <artifactId>${conflict.artifactId}</artifactId>`);
                console.log(`        <version>${conflict.versions[conflict.versions.length - 1]}</version>`);
                console.log(`      </dependency>`);
                console.log(`    </dependencies>`);
                console.log(`  </dependencyManagement>`);
            } else {
                console.log("  Adicione ao build.gradle:");
                console.log(`  implementation("${conflict.groupId}:${conflict.artifactId}:${conflict.versions[conflict.versions.length - 1]}")`);
            }
        }
    }

    private async performUpdateSafe(
        analyzer: DependencyAnalyzerService,
        result: DependencyAnalysisResult,
        buildTool: string
    ): Promise<void> {
        const safeUpdates = result.updates.filter(u => !u.isMajor);
        
        if (safeUpdates.length === 0) {
            this.logger.info("Nenhuma atualização segura disponível");
            return;
        }

        this.logger.newline();
        this.logger.section("Atualizando Dependências (Safe Mode)");
        this.logger.config("Atualizações a aplicar", String(safeUpdates.length));

        const spinner = this.logger.spinner("Atualizando arquivos de configuração...");
        
        try {
            const updateResult = await analyzer.updateSafe(safeUpdates);
            spinner.stop();

            if (updateResult.updated > 0) {
                this.logger.success(`${updateResult.updated} dependências atualizadas`);
                this.logger.info(`Backup criado: ${buildTool === "maven" ? "pom.xml.backup" : "build.gradle.backup"}`);
                
                // Listar o que foi atualizado
                for (const update of safeUpdates.slice(0, 5)) {
                    console.log(`  ↑ ${update.groupId}:${update.artifactId} ${update.currentVersion} → ${update.latestVersion}`);
                }
                if (safeUpdates.length > 5) {
                    console.log(`  ... e mais ${safeUpdates.length - 5}`);
                }

                this.logger.newline();
                console.log(`! Execute 'xavva build' para compilar e aplicar as mudancas`);
                console.log(`* Dica: Execute 'xavva audit' para verificar vulnerabilidades nas novas versoes`);
            } else {
                this.logger.warn("Nenhuma dependência foi atualizada");
            }

            if (updateResult.skipped > 0) {
                this.logger.config("Dependências ignoradas", `${updateResult.skipped} (definidas via propriedades)`);
            }

            if (updateResult.errors.length > 0) {
                for (const error of updateResult.errors) {
                    this.logger.warn(error);
                }
            }
        } catch (error) {
            spinner.stop(false);
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Falha na atualização: ${message}`);
        }
    }

    private exportReport(
        result: DependencyAnalysisResult,
        outputPath: string
    ): void {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8"));
        const data = {
            timestamp: new Date().toISOString(),
            tool: "xavva",
            version: pkg.version,
            result
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        this.logger.success(`Relatório exportado para: ${outputPath}`);
    }
}
