import fs from "fs";
import path from "path";
import type { ProjectConfig } from "../types/config";
import { Logger } from "../utils/ui";

export interface Dependency {
	groupId: string;
	artifactId: string;
	version: string;
	scope?: string;
	type: "direct" | "transitive";
}

export interface DependencyConflict {
	artifactId: string;
	groupId: string;
	versions: string[];
	locations: string[];
	severity: "warning" | "error";
}

export interface DependencyUpdate {
	groupId: string;
	artifactId: string;
	currentVersion: string;
	latestVersion: string;
	isMajor: boolean;
	changelog?: string;
}

export interface DependencyAnalysisResult {
	dependencies: Dependency[];
	conflicts: DependencyConflict[];
	updates: DependencyUpdate[];
	outdated: Dependency[];
	stats: {
		total: number;
		direct: number;
		transitive: number;
		vulnerable: number;
		outdatedCount: number;
	};
}

interface MavenDependency {
	groupId: string;
	artifactId: string;
	version: string;
	scope?: string;
	optional?: boolean;
}

export class DependencyAnalyzerService {
	constructor(private projectConfig: ProjectConfig) {}

	async analyze(): Promise<DependencyAnalysisResult> {
		const deps = await this.extractDependencies();
		const conflicts = this.detectConflicts(deps);
		const updates = await this.checkUpdates(deps);
		const outdated = deps.filter(d => updates.some(u => 
			u.groupId === d.groupId && u.artifactId === d.artifactId
		));

		return {
			dependencies: deps,
			conflicts,
			updates,
			outdated,
			stats: {
				total: deps.length,
				direct: deps.filter(d => d.type === "direct").length,
				transitive: deps.filter(d => d.type === "transitive").length,
				vulnerable: 0, // Será preenchido pelo AuditService
				outdatedCount: outdated.length
			}
		};
	}

	private async extractDependencies(): Promise<Dependency[]> {
		if (this.projectConfig.buildTool === "maven") {
			return this.extractMavenDependencies();
		} else {
			return this.extractGradleDependencies();
		}
	}

	private verbose: boolean = false;

	setVerbose(verbose: boolean) {
		this.verbose = verbose;
	}

	private async extractMavenDependencies(): Promise<Dependency[]> {
		const deps: Dependency[] = [];
		const pomPath = path.join(process.cwd(), "pom.xml");
		
		if (!fs.existsSync(pomPath)) {
			Logger.warn("pom.xml não encontrado");
			return deps;
		}

		if (this.verbose) {
			Logger.info("Tentando extrair dependências do Maven...", "");
		}

		// Tentar várias estratégias para extrair dependências
		
		// 1. Tentar mvn dependency:tree
		try {
			const mvnCmd = process.platform === "win32" ? "mvn.cmd" : "mvn";
			Logger.step("Executando mvn dependency:tree...");
			
			const output = Bun.spawnSync([
				mvnCmd,
				"dependency:tree",
				"-DoutputType=text",
				"-q"
			], { cwd: process.cwd() });

			if (output.exitCode === 0) {
				const treeOutput = output.stdout.toString();
				const parsed = this.parseMavenTree(treeOutput);
				if (parsed.length > 0) {
					Logger.success(`Encontradas ${parsed.length} dependências via Maven tree`);
					return parsed;
				}
			} else {
				const errorOutput = output.stderr.toString();
				if (this.verbose) {
					Logger.warn(`mvn dependency:tree falhou: ${errorOutput.substring(0, 200)}`);
				}
			}
		} catch (e) {
			if (this.verbose) {
				Logger.warn(`Não foi possível executar mvn dependency:tree: ${e}`);
			}
		}

		// 2. Fallback: Parse direto do pom.xml
		Logger.step("Analisando pom.xml diretamente...");
		const pomDeps = this.parsePomDirect();
		if (pomDeps.length > 0) {
			Logger.success(`Encontradas ${pomDeps.length} dependências no pom.xml`);
			return pomDeps;
		}

		// 3. Último recurso: Verificar pasta lib do Tomcat (se existir)
		const libDeps = await this.extractFromLibFolder();
		if (libDeps.length > 0) {
			Logger.success(`Encontradas ${libDeps.length} dependências na pasta lib`);
			return libDeps;
		}

		Logger.warn("Nenhuma dependência encontrada");
		return deps;
	}

	private async extractFromLibFolder(): Promise<Dependency[]> {
		const deps: Dependency[] = [];
		const libPath = path.join(process.cwd(), "target", "dependency");
		
		if (!fs.existsSync(libPath)) {
			// Tentar gerar com mvn dependency:copy-dependencies
			try {
				const mvnCmd = process.platform === "win32" ? "mvn.cmd" : "mvn";
				Logger.step("Tentando baixar dependências...");
				Bun.spawnSync([
					mvnCmd,
					"dependency:copy-dependencies",
					"-DoutputDirectory=target/dependency",
					"-q"
				], { cwd: process.cwd() });
			} catch (e) {
				return deps;
			}
		}

		if (fs.existsSync(libPath)) {
			const files = fs.readdirSync(libPath).filter(f => f.endsWith(".jar"));
			for (const file of files) {
				const parsed = this.parseJarName(file);
				if (parsed) {
					deps.push({ ...parsed, type: "direct" });
				}
			}
		}

		return deps;
	}

	private parseJarName(jarName: string): { groupId: string; artifactId: string; version: string } | null {
		// Remove .jar extension
		const name = jarName.replace(/\.jar$/, "");
		
		// Tenta extrair: artifactId-version
		const match = name.match(/^(.+?)-(\d[\d\.-]*(?:-SNAPSHOT)?)$/);
		if (match) {
			return {
				groupId: "unknown", // Não conseguimos extrair do nome do JAR
				artifactId: match[1],
				version: match[2]
			};
		}
		
		return null;
	}

	private parseMavenTree(output: string): Dependency[] {
		const deps: Dependency[] = [];
		const lines = output.split("\n");
		const seen = new Set<string>();

		for (const line of lines) {
			// Pattern: [INFO] |  |  \- org.springframework:spring-core:jar:5.3.9:compile
			// ou: [INFO] +- org.springframework:spring-core:jar:5.3.9:compile
			const match = line.match(/[\\|\-+]\s+([^:]+):([^:]+):[^:]+:([^:]+):?(\w+)?/);
			if (match) {
				const [, groupId, artifactId, version, scope] = match;
				const key = `${groupId}:${artifactId}:${version}`;
				
				if (!seen.has(key)) {
					seen.add(key);
					// Determina se é direto ou transitivo pelo nível de indentação
					const level = (line.match(/[|\\]/g) || []).length;
					deps.push({
						groupId,
						artifactId,
						version,
						scope: scope || "compile",
						type: level <= 1 ? "direct" : "transitive"
					});
				}
			}
		}

		return deps;
	}

	private parsePomDirect(): Dependency[] {
		const deps: Dependency[] = [];
		const pomPath = path.join(process.cwd(), "pom.xml");
		
		try {
			const content = fs.readFileSync(pomPath, "utf-8");
			
			// Remove comentários XML para não interferir no parse
			const cleanContent = content.replace(/<!--[\s\S]*?-->/g, "");
			
			// Parse de dependencies - suporta propriedades ${...}
			const depRegex = /<dependency>\s*([\s\S]*?)<\/dependency>/g;
			let match;
			
			while ((match = depRegex.exec(cleanContent)) !== null) {
				const depBlock = match[1];
				
				// Extrai groupId
				let groupId = depBlock.match(/<groupId>\s*([^<$]+)\s*<\/groupId>/)?.[1]?.trim();
				// Extrai artifactId
				let artifactId = depBlock.match(/<artifactId>\s*([^<$]+)\s*<\/artifactId>/)?.[1]?.trim();
				// Extrai version
				let version = depBlock.match(/<version>\s*([^<$]+)\s*<\/version>/)?.[1]?.trim();
				// Extrai scope
				const scope = depBlock.match(/<scope>\s*([^<$]+)\s*<\/scope>/)?.[1]?.trim();
				
				// Resolve propriedades simples ${property}
				if (version?.startsWith("${")) {
					const propName = version.slice(2, -1);
					const propValue = cleanContent.match(new RegExp(`<${propName}>([^<]+)</${propName}>`))?.[1];
					if (propValue) version = propValue.trim();
				}
				
				if (groupId && artifactId) {
					// Se não tiver versão, tenta encontrar no dependencyManagement
					if (!version || version.startsWith("${")) {
						version = this.findVersionInDependencyManagement(cleanContent, groupId, artifactId) || version || "managed";
					}
					
					deps.push({
						groupId,
						artifactId,
						version,
						scope,
						type: "direct"
					});
				}
			}
			
			Logger.info("Dependências encontradas no pom.xml", String(deps.length));
		} catch (e) {
			Logger.warn(`Não foi possível analisar o pom.xml: ${e}`);
		}

		return deps;
	}
	
	private findVersionInDependencyManagement(content: string, groupId: string, artifactId: string): string | null {
		// Busca no dependencyManagement
		const dmMatch = content.match(/<dependencyManagement>\s*<dependencies>([\s\S]*?)<\/dependencies>\s*<\/dependencyManagement>/);
		if (dmMatch) {
			const dmBlock = dmMatch[1];
			const depRegex = /<dependency>\s*([\s\S]*?)<\/dependency>/g;
			let match;
			
			while ((match = depRegex.exec(dmBlock)) !== null) {
				const depBlock = match[1];
				const depGroupId = depBlock.match(/<groupId>\s*([^<]+)\s*<\/groupId>/)?.[1]?.trim();
				const depArtifactId = depBlock.match(/<artifactId>\s*([^<]+)\s*<\/artifactId>/)?.[1]?.trim();
				const depVersion = depBlock.match(/<version>\s*([^<]+)\s*<\/version>/)?.[1]?.trim();
				
				if (depGroupId === groupId && depArtifactId === artifactId && depVersion) {
					return depVersion;
				}
			}
		}
		return null;
	}

	private async extractGradleDependencies(): Promise<Dependency[]> {
		const deps: Dependency[] = [];
		
		try {
			const gradleCmd = process.platform === "win32" ? "gradle.bat" : "gradle";
			const output = Bun.spawnSync([
				gradleCmd,
				"dependencies",
				"--configuration",
				"runtimeClasspath",
				"-q"
			], { cwd: process.cwd() });

			if (output.exitCode === 0) {
				deps.push(...this.parseGradleTree(output.stdout.toString()));
			}
		} catch (e) {
			Logger.warn("Não foi possível executar gradle dependencies");
		}

		return deps;
	}

	private parseGradleTree(output: string): Dependency[] {
		const deps: Dependency[] = [];
		const lines = output.split("\n");
		const seen = new Set<string>();

		for (const line of lines) {
			// Pattern: |    |    +--- org.springframework:spring-core:5.3.9
			const match = line.match(/[\\|\-+]+\s+([^:]+):([^:]+):([^\s]+)/);
			if (match) {
				const [, groupId, artifactId, version] = match;
				const key = `${groupId}:${artifactId}:${version}`;
				
				if (!seen.has(key)) {
					seen.add(key);
					const level = (line.match(/[|\\]/g) || []).length;
					deps.push({
						groupId,
						artifactId,
						version,
						type: level <= 1 ? "direct" : "transitive"
					});
				}
			}
		}

		return deps;
	}

	private detectConflicts(deps: Dependency[]): DependencyConflict[] {
		const conflicts: DependencyConflict[] = [];
		const grouped = new Map<string, Dependency[]>();

		// Agrupar por groupId:artifactId
		for (const dep of deps) {
			const key = `${dep.groupId}:${dep.artifactId}`;
			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key)!.push(dep);
		}

		// Detectar conflitos (mesmo artifact, versões diferentes)
		for (const [key, versions] of grouped) {
			const uniqueVersions = [...new Set(versions.map(v => v.version))];
			if (uniqueVersions.length > 1) {
				const [groupId, artifactId] = key.split(":");
				const hasDirect = versions.some(v => v.type === "direct");
				
				conflicts.push({
					groupId,
					artifactId,
					versions: uniqueVersions,
					locations: versions.map(v => v.scope || "compile"),
					severity: hasDirect ? "error" : "warning"
				});
			}
		}

		return conflicts;
	}

	private async checkUpdates(deps: Dependency[]): Promise<DependencyUpdate[]> {
		const updates: DependencyUpdate[] = [];
		const directDeps = deps.filter(d => d.type === "direct");

		// Verificar atualizações em paralelo (com limite)
		const chunkSize = 5;
		for (let i = 0; i < directDeps.length; i += chunkSize) {
			const chunk = directDeps.slice(i, i + chunkSize);
			const promises = chunk.map(dep => this.checkSingleUpdate(dep));
			const results = await Promise.all(promises);
			updates.push(...results.filter((u): u is DependencyUpdate => u !== null));
		}

		return updates;
	}

	private async checkSingleUpdate(dep: Dependency): Promise<DependencyUpdate | null> {
		try {
			const latest = await this.fetchLatestVersion(dep.groupId, dep.artifactId);
			if (latest && this.isNewer(latest, dep.version)) {
				return {
					groupId: dep.groupId,
					artifactId: dep.artifactId,
					currentVersion: dep.version,
					latestVersion: latest,
					isMajor: this.isMajorUpdate(dep.version, latest)
				};
			}
		} catch (e) {
			// Silenciar erros de rede
		}
		return null;
	}

	private async fetchLatestVersion(groupId: string, artifactId: string): Promise<string | null> {
		// Usar Maven Central API
		try {
			const url = `https://search.maven.org/solrsearch/select?q=g:"${groupId}"+AND+a:"${artifactId}"&rows=1&wt=json`;
			const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
			const data = await response.json();
			
			if (data.response?.docs?.[0]?.latestVersion) {
				return data.response.docs[0].latestVersion;
			}
		} catch (e) {
			// Fallback silencioso
		}
		return null;
	}

	private isNewer(latest: string, current: string): boolean {
		return this.compareVersions(latest, current) > 0;
	}

	private isMajorUpdate(current: string, latest: string): boolean {
		const currentMajor = current.split(".")[0];
		const latestMajor = latest.split(".")[0];
		return currentMajor !== latestMajor;
	}

	private compareVersions(v1: string, v2: string): number {
		const parts1 = v1.split(/[.-]/).filter(p => /^\d+$/.test(p)).map(Number);
		const parts2 = v2.split(/[.-]/).filter(p => /^\d+$/.test(p)).map(Number);
		
		for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
			const p1 = parts1[i] || 0;
			const p2 = parts2[i] || 0;
			if (p1 !== p2) return p1 - p2;
		}
		return 0;
	}

	async updateSafe(updates: DependencyUpdate[]): Promise<{ updated: number; skipped: number; errors: string[] }> {
		const safeUpdates = updates.filter(u => !u.isMajor);
		const result = { updated: 0, skipped: 0, errors: [] as string[] };
		
		if (safeUpdates.length === 0) {
			return result;
		}

		if (this.projectConfig.buildTool === "maven") {
			return this.updateMavenSafe(safeUpdates);
		} else {
			return this.updateGradleSafe(safeUpdates);
		}
	}

	private async updateMavenSafe(updates: DependencyUpdate[]): Promise<{ updated: number; skipped: number; errors: string[] }> {
		const result = { updated: 0, skipped: 0, errors: [] as string[] };
		const pomPath = path.join(process.cwd(), "pom.xml");
		
		if (!fs.existsSync(pomPath)) {
			result.errors.push("pom.xml não encontrado");
			return result;
		}

		let content = fs.readFileSync(pomPath, "utf-8");
		let modified = false;

		for (const update of updates) {
			// Pattern para encontrar a versão específica desta dependência
			const groupId = update.groupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const artifactId = update.artifactId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const currentVersion = update.currentVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			
			// Regex para encontrar <version> dentro do bloco da dependência
			const depPattern = new RegExp(
				`(<dependency>\\s*<groupId>${groupId}</groupId>\\s*<artifactId>${artifactId}</artifactId>(?:\\s*<version>)${currentVersion}(</version>))`,
				'g'
			);
			
			if (depPattern.test(content)) {
				content = content.replace(depPattern, `$1${update.latestVersion}$2`);
				result.updated++;
				modified = true;
			} else {
				// Pode ser definida via property
				result.skipped++;
			}
		}

		if (modified) {
			// Backup do pom.xml
			fs.writeFileSync(`${pomPath}.backup`, fs.readFileSync(pomPath));
			fs.writeFileSync(pomPath, content);
		}

		return result;
	}

	private async updateGradleSafe(updates: DependencyUpdate[]): Promise<{ updated: number; skipped: number; errors: string[] }> {
		const result = { updated: 0, skipped: 0, errors: [] as string[] };
		const gradlePath = path.join(process.cwd(), "build.gradle");
		
		if (!fs.existsSync(gradlePath)) {
			result.errors.push("build.gradle não encontrado");
			return result;
		}

		let content = fs.readFileSync(gradlePath, "utf-8");
		let modified = false;

		for (const update of updates) {
			const groupId = update.groupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const artifactId = update.artifactId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const currentVersion = update.currentVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			
			// Pattern: implementation("group:artifact:version") ou implementation 'group:artifact:version'
			const patterns = [
				new RegExp(`(implementation\\s*\\(\\s*["']${groupId}:${artifactId}:)${currentVersion}(["']\\s*\\))`, 'g'),
				new RegExp(`(implementation\\s+["']${groupId}:${artifactId}:)${currentVersion}(["'])`, 'g'),
				new RegExp(`(compile\\s*\\(\\s*["']${groupId}:${artifactId}:)${currentVersion}(["']\\s*\\))`, 'g'),
				new RegExp(`(compile\\s+["']${groupId}:${artifactId}:)${currentVersion}(["'])`, 'g'),
			];
			
			let updated = false;
			for (const pattern of patterns) {
				if (pattern.test(content)) {
					content = content.replace(pattern, `$1${update.latestVersion}$2`);
					updated = true;
					break;
				}
			}
			
			if (updated) {
				result.updated++;
				modified = true;
			} else {
				result.skipped++;
			}
		}

		if (modified) {
			fs.writeFileSync(`${gradlePath}.backup`, fs.readFileSync(gradlePath));
			fs.writeFileSync(gradlePath, content);
		}

		return result;
	}

	generateReport(result: DependencyAnalysisResult): string {
		const lines: string[] = [];
		lines.push("");
		lines.push(`${Logger.C.primary}══════════════════════════════════════════════════════════${Logger.C.reset}`);
		lines.push(`${Logger.C.bold}📊 ANÁLISE DE DEPENDÊNCIAS${Logger.C.reset}`);
		lines.push(`${Logger.C.primary}══════════════════════════════════════════════════════════${Logger.C.reset}`);
		lines.push("");
		
		// Estatísticas
		lines.push(`${Logger.C.dim}Estatísticas:${Logger.C.reset}`);
		lines.push(`  Total: ${result.stats.total} dependências`);
		lines.push(`  Diretas: ${result.stats.direct} | Transitivas: ${result.stats.transitive}`);
		lines.push("");

		// Conflitos
		if (result.conflicts.length > 0) {
			lines.push(`${Logger.C.warning}⚠️  CONFLITOS DE VERSÃO (${result.conflicts.length})${Logger.C.reset}`);
			for (const conflict of result.conflicts) {
				const icon = conflict.severity === "error" ? "✖" : "▲";
				const color = conflict.severity === "error" ? Logger.C.error : Logger.C.warning;
				lines.push(`  ${color}${icon}${Logger.C.reset} ${conflict.groupId}:${conflict.artifactId}`);
				lines.push(`     Versões: ${conflict.versions.join(", ")}`);
			}
			lines.push("");
		}

		// Atualizações
		if (result.updates.length > 0) {
			const majorUpdates = result.updates.filter(u => u.isMajor);
			const minorUpdates = result.updates.filter(u => !u.isMajor);

			if (minorUpdates.length > 0) {
				lines.push(`${Logger.C.success}⬆️  ATUALIZAÇÕES DISPONÍVEIS (${minorUpdates.length})${Logger.C.reset}`);
				for (const update of minorUpdates.slice(0, 5)) {
					lines.push(`  ${Logger.C.success}↑${Logger.C.reset} ${update.groupId}:${update.artifactId}`);
					lines.push(`     ${update.currentVersion} → ${Logger.C.success}${update.latestVersion}${Logger.C.reset}`);
				}
				if (minorUpdates.length > 5) {
					lines.push(`  ${Logger.C.dim}... e mais ${minorUpdates.length - 5}${Logger.C.reset}`);
				}
				lines.push("");
			}

			if (majorUpdates.length > 0) {
				lines.push(`${Logger.C.warning}⚠️  ATUALIZAÇÕES MAJOR (${majorUpdates.length})${Logger.C.reset}`);
				lines.push(`  ${Logger.C.dim}Podem conter breaking changes${Logger.C.reset}`);
				for (const update of majorUpdates.slice(0, 3)) {
					lines.push(`  ${Logger.C.warning}!${Logger.C.reset} ${update.groupId}:${update.artifactId}`);
					lines.push(`     ${update.currentVersion} → ${Logger.C.warning}${update.latestVersion}${Logger.C.reset}`);
				}
				lines.push("");
			}
		}

		// Resumo
		if (result.conflicts.length === 0 && result.updates.length === 0) {
			lines.push(`${Logger.C.success}✔ Todas as dependências estão atualizadas!${Logger.C.reset}`);
		}

		lines.push("");
		lines.push(`${Logger.C.dim}Dica: Execute 'xavva audit' para verificar vulnerabilidades${Logger.C.reset}`);
		
		return lines.join("\n");
	}
}
