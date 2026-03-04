import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import type { DependencyAnalysisResult } from "../services/DependencyAnalyzerService";
import { DependencyAnalyzerService } from "../services/DependencyAnalyzerService";
import { AuditService } from "../services/AuditService";
import { Logger } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";
import fs from "fs";

export class DepsCommand implements Command {
	private config!: AppConfig;

	async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
		this.config = config;
		const analyzer = new DependencyAnalyzerService(config.project);
		analyzer.setVerbose(!!args?.verbose);

		Logger.section("Análise de Dependências");
		Logger.info("Ferramenta", config.project.buildTool.toUpperCase());
		Logger.info("Diretório", process.cwd());
		
		const spinner = Logger.spinner("Analisando dependências...");
		
		try {
			const result = await analyzer.analyze();
			spinner();

			// Se não encontrou dependências, mostrar ajuda
			if (result.dependencies.length === 0) {
				Logger.warn("Nenhuma dependência encontrada!");
				Logger.info("Possíveis causas:", "");
				Logger.log("  • Projeto não foi compilado ainda (execute: mvn compile)");
				Logger.log("  • Maven não está no PATH");
				Logger.log("  • Arquivo pom.xml/build.gradle não encontrado");
				Logger.log("  • Erro de parsing no arquivo de configuração");
				Logger.newline();
				Logger.log(`${Logger.C.cyan}Dica:${Logger.C.reset} Execute com --verbose para mais detalhes`);
				return;
			}

			// Verificar vulnerabilidades se solicitado
			if (args?.["scan"] !== false) {
				Logger.step("Verificando vulnerabilidades");
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
			spinner(false);
			const message = error instanceof Error ? error.message : String(error);
			Logger.error(`Falha na análise: ${message}`);
			throw error;
		}
	}

	private async suggestFixes(result: DependencyAnalysisResult, buildTool: string): Promise<void> {
		if (result.conflicts.length === 0) {
			Logger.success("Nenhum conflito para resolver!");
			return;
		}

		Logger.newline();
		Logger.section("Sugestões de Correção");

		for (const conflict of result.conflicts) {
			Logger.log(`\n${Logger.C.cyan}${conflict.groupId}:${conflict.artifactId}${Logger.C.reset}`);
			
			if (buildTool === "maven") {
				Logger.log("  Adicione ao pom.xml:");
				Logger.log(`  ${Logger.C.dim}<dependencyManagement>${Logger.C.reset}`);
				Logger.log(`  ${Logger.C.dim}  <dependencies>${Logger.C.reset}`);
				Logger.log(`  ${Logger.C.dim}    <dependency>${Logger.C.reset}`);
				Logger.log(`  ${Logger.C.dim}      <groupId>${conflict.groupId}</groupId>${Logger.C.reset}`);
				Logger.log(`  ${Logger.C.dim}      <artifactId>${conflict.artifactId}</artifactId>${Logger.C.reset}`);
				Logger.log(`  ${Logger.C.dim}      <version>${conflict.versions[conflict.versions.length - 1]}</version>${Logger.C.reset}`);
				Logger.log(`  ${Logger.C.dim}    </dependency>${Logger.C.reset}`);
				Logger.log(`  ${Logger.C.dim}  </dependencies>${Logger.C.reset}`);
				Logger.log(`  ${Logger.C.dim}</dependencyManagement>${Logger.C.reset}`);
			} else {
				Logger.log("  Adicione ao build.gradle:");
				Logger.log(`  ${Logger.C.dim}implementation("${conflict.groupId}:${conflict.artifactId}:${conflict.versions[conflict.versions.length - 1]}")${Logger.C.reset}`);
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
			Logger.info("", "Nenhuma atualização segura disponível");
			return;
		}

		Logger.newline();
		Logger.section("Atualizando Dependências (Safe Mode)");
		Logger.info("Atualizações a aplicar", String(safeUpdates.length));

		const spinner = Logger.spinner("Atualizando arquivos de configuração...");
		
		try {
			const updateResult = await analyzer.updateSafe(safeUpdates);
			spinner();

			if (updateResult.updated > 0) {
				Logger.success(`${updateResult.updated} dependências atualizadas`);
				Logger.info("", `Backup criado: ${buildTool === "maven" ? "pom.xml.backup" : "build.gradle.backup"}`);
				
				// Listar o que foi atualizado
				for (const update of safeUpdates.slice(0, 5)) {
					Logger.log(`  ${Logger.C.success}↑${Logger.C.reset} ${update.groupId}:${update.artifactId} ${update.currentVersion} → ${Logger.C.success}${update.latestVersion}${Logger.C.reset}`);
				}
				if (safeUpdates.length > 5) {
					Logger.log(`  ${Logger.C.dim}... e mais ${safeUpdates.length - 5}${Logger.C.reset}`);
				}

				Logger.newline();
				Logger.log(`${Logger.C.warning}⚠️  Execute 'xavva build' para compilar e aplicar as mudanças${Logger.C.reset}`);
				Logger.log(`${Logger.C.cyan}💡 Dica:${Logger.C.reset} Execute 'xavva audit' para verificar vulnerabilidades nas novas versões`);
			} else {
				Logger.warn("Nenhuma dependência foi atualizada");
			}

			if (updateResult.skipped > 0) {
				Logger.info("Dependências ignoradas", `${updateResult.skipped} (definidas via propriedades)`);
			}

			if (updateResult.errors.length > 0) {
				for (const error of updateResult.errors) {
					Logger.warn(error);
				}
			}
		} catch (error) {
			spinner(false);
			const message = error instanceof Error ? error.message : String(error);
			Logger.error(`Falha na atualização: ${message}`);
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
		Logger.success(`Relatório exportado para: ${outputPath}`);
	}
}

import path from "path";
