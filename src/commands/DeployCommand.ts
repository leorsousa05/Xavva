import path from "path";
import fs from "fs";
import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { BuildService } from "../services/BuildService";
import { TomcatService } from "../services/TomcatService";
import { Logger, OperationLogger } from "../logging";
import { EndpointService } from "../services/EndpointService";
import { BrowserService } from "../services/BrowserService";
import {
	getJavaPath,
	getWarExtractCommand,
	isWindows,
} from "../utils/platform";

export class DeployCommand implements Command {
	private logger = Logger.getInstance();

	constructor(private tomcat: TomcatService, private builder: BuildService) {}

	async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
		const incremental = args?.watch && args?.incremental;
		const isWatching = !!args?.watch;
		const changedFiles = args?.changedFiles;
		const tomcat = this.tomcat;
		const builder = this.builder;

		// Verifica modo de execução (Spring Boot vs Tomcat tradicional)
		const executionMode = (config.project as any).executionMode || 'embedded';
		
		if (executionMode === 'springboot') {
			await this.executeSpringBoot(config, args);
			return;
		}

		// Cria operação para rastreamento
		const operation = new OperationLogger(incremental ? 'hot-reload' : 'deploy');

		if (!incremental) {
			this.logConfiguration(config, isWatching);
		} else {
			this.logger.debug("Mudança detectada");
		}
		
		try {
			const contextPath = (config.project.appName || "").replace(".war", "");

			if (!incremental) {
				operation.start('Iniciando deploy');
				
				await tomcat.killConflict();
				await tomcat.clearWebapps();

				if (!config.project.skipBuild) {
					const buildStep = operation.step('build', 'Compilando projeto...');
					await builder.runBuild(incremental);
					buildStep.success('Compilação concluída');
				}
			} else {
				if (!config.project.skipBuild) {
					this.logger.debug('Compilação incremental...');
					await builder.runBuild(incremental);
				}
			}

			if (incremental) {
				const syncStep = operation.step('sync', 'Sincronizando classes...');
				const actualAppFolder = await builder.syncClasses(changedFiles); 
				const actualContextPath = contextPath || actualAppFolder || "";
				const actualAppUrl = `http://localhost:${config.tomcat.port}/${actualContextPath}`;
				await BrowserService.reload(actualAppUrl);
				
				const fileCount = changedFiles?.length || 0;
				if (fileCount > 0) {
					syncStep.success(`${fileCount} arquivo(s) sincronizado(s)`);
					this.logger.success(`Hot-reload concluído`);
				} else {
					syncStep.success('Hot-reload concluído');
				}
				return;
			}

			const deployStep = operation.step('deploy', 'Preparando deploy...');
			const artifactInfo = await builder.deployToWebapps();
			
			const finalContextPath = contextPath || artifactInfo.finalName.replace(".war", "");
			const appWebappPath = path.join(config.tomcat.path, "webapps", finalContextPath);

			if (artifactInfo.isDirectory) {
				// Se é um diretório (exploded), sincronizamos o conteúdo total para a pasta do webapps
				if (!fs.existsSync(appWebappPath)) fs.mkdirSync(appWebappPath, { recursive: true });
				await builder.syncExploded(artifactInfo.path, appWebappPath);
				deployStep.update('Diretório exploded sincronizado');
			} else {
				if (!fs.existsSync(appWebappPath)) fs.mkdirSync(appWebappPath, { recursive: true });

				const artifactStat = fs.statSync(artifactInfo.path);
				const webappStat = fs.existsSync(appWebappPath) ? fs.statSync(appWebappPath) : null;

				if (!webappStat || artifactStat.mtimeMs > webappStat.mtimeMs) {
					try {
						Bun.spawnSync(["jar", "xf", artifactInfo.path], { cwd: appWebappPath });
						deployStep.update('WAR extraído');
					} catch (e) {
						// Fallback para extração com jar (funciona em todas as plataformas)
						if (isWindows()) {
							const extractCmd = `Expand-Archive -Path $env:ARTIFACT_PATH -DestinationPath $env:DEST_PATH -Force`;
							Bun.spawnSync(["powershell", "-command", extractCmd], {
								env: {
									...process.env,
									ARTIFACT_PATH: artifactInfo.path,
									DEST_PATH: appWebappPath
								}
							});
						} else {
							// Linux/Mac: usa unzip ou jar
							try {
								Bun.spawnSync(["unzip", "-q", "-o", artifactInfo.path, "-d", appWebappPath]);
							} catch {
								// Fallback final para jar
								Bun.spawnSync(getWarExtractCommand(artifactInfo.path, appWebappPath), {
									cwd: appWebappPath
								});
							}
						}
						deployStep.update('WAR extraído (fallback)');
					}
				} else {
					deployStep.update('Webapp já está atualizado');
				}
			}
			
			deployStep.success('Deploy preparado');

			this.injectContextConfiguration(appWebappPath);
			this.injectHotswapProperties(appWebappPath);

			const finalAppUrl = `http://localhost:${config.tomcat.port}/${finalContextPath}`;
			
			tomcat.onReady = async () => {
				await this.handleServerReady(config, finalAppUrl, finalContextPath, tomcat, !!incremental);
			};

			const serverStep = operation.step('server', 'Iniciando Tomcat...');
			tomcat.start(config, isWatching);
			
			// O serverStep será concluído quando o Tomcat estiver pronto
			// (via callback onReady)
			
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(message);
			operation.fail('Deploy falhou', error as Error);
			throw error;
		}
	}

	/**
	 * Executa aplicação Spring Boot
	 */
	private async executeSpringBoot(config: AppConfig, args?: CLIArguments): Promise<void> {
		const isWatching = !!args?.watch;
		
		this.logger.section("Spring Boot Development");
		this.logger.newline();
		this.logger.config("Runtime", config.project.buildTool);
		this.logger.config("Profile", config.project.profile || "default");
		this.logger.config("Watch", isWatching ? "sim" : "não");
		this.logger.newline();

		const operation = new OperationLogger('springboot');
		operation.start('Iniciando Spring Boot');

		// Build específico para Spring Boot (sem war:exploded)
		if (!config.project.skipBuild) {
			const buildStep = operation.step('build', 'Compilando projeto...');
			await this.buildSpringBoot(config);
			buildStep.success('Compilação concluída');
		}

		// Inicia Spring Boot
		const runStep = operation.step('run', 'Iniciando aplicação...');
		
		const port = config.tomcat.port;
		const profile = config.project.profile || 'local';
		
		if (config.project.buildTool === 'maven') {
			await this.runMavenSpringBoot(port, profile, isWatching);
		} else {
			await this.runGradleSpringBoot(port, profile, isWatching);
		}
		
		runStep.success('Aplicação iniciada');
	}

	/**
	 * Build específico para Spring Boot (sem gerar WAR)
	 */
	private async buildSpringBoot(config: AppConfig): Promise<void> {
		const { getMavenCommand, getGradleCommand } = await import('../utils/platform');
		
		const env = { ...process.env };
		if (config.project.encoding) {
			env.MAVEN_OPTS = `${env.MAVEN_OPTS || ''} -Dfile.encoding=${config.project.encoding}`;
		}

		if (config.project.buildTool === 'maven') {
			const args = [
				getMavenCommand(),
				'compile',
				'-DskipTests',
				'-Dmaven.test.skip=true'
			];
			
			if (config.project.profile) {
				args.push(`-P${config.project.profile}`);
			}
			
			if (config.project.encoding) {
				args.push(`-Dproject.build.sourceEncoding=${config.project.encoding}`);
			}

			const proc = Bun.spawn(args, {
				stdout: 'inherit',
				stderr: 'inherit',
				env
			});

			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				throw new Error(`Maven build falhou com código ${exitCode}`);
			}
		} else {
			const args = [
				getGradleCommand(),
				'classes',
				'-x', 'test'
			];
			
			if (config.project.profile) {
				args.push(`-Pprofile=${config.project.profile}`);
			}

			const proc = Bun.spawn(args, {
				stdout: 'inherit',
				stderr: 'inherit',
				env
			});

			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				throw new Error(`Gradle build falhou com código ${exitCode}`);
			}
		}
	}

	/**
	 * Executa Spring Boot com Maven
	 */
	private async runMavenSpringBoot(port: number, profile: string, watch: boolean): Promise<void> {
		const { getMavenCommand } = await import('../utils/platform');
		
		const args = [
			getMavenCommand(),
			'spring-boot:run',
			`-Dspring-boot.run.profiles=${profile}`,
			`-Dserver.port=${port}`,
			'-DskipTests'
		];

		if (watch) {
			this.logger.info('Modo watch: use Ctrl+C para parar');
		}

		this.logger.info(`Iniciando: ${args.join(' ')}`);
		this.logger.newline();

		const proc = Bun.spawn(args, {
			stdout: 'inherit',
			stderr: 'inherit',
			stdin: 'inherit'
		});

		await proc.exited;
	}

	/**
	 * Executa Spring Boot com Gradle
	 */
	private async runGradleSpringBoot(port: number, profile: string, watch: boolean): Promise<void> {
		const { getGradleCommand } = await import('../utils/platform');
		
		const args = [
			getGradleCommand(),
			'bootRun',
			`-Pprofile=${profile}`,
			`-Dserver.port=${port}`,
			'-x', 'test'
		];

		if (watch) {
			this.logger.info('Modo watch: use Ctrl+C para parar');
		}

		this.logger.info(`Iniciando: ${args.join(' ')}`);
		this.logger.newline();

		const proc = Bun.spawn(args, {
			stdout: 'inherit',
			stderr: 'inherit',
			stdin: 'inherit'
		});

		await proc.exited;
	}

	private logConfiguration(config: AppConfig, isWatching: boolean) {
		this.logger.section("Configuração");
		this.logger.config("runtime", config.project.buildTool.toLowerCase());
		if (config.project.profile) this.logger.config("profile", config.project.profile);
		this.logger.config("watch", isWatching);
		this.logger.config("debug", config.project.debug ? `porta ${config.project.debugPort}` : false);

		const javaVer = Bun.spawnSync([getJavaPath(), "-version"]);
		const output = (javaVer.stderr.toString() + javaVer.stdout.toString()).toLowerCase();
		const hasDcevm = ["dcevm", "jetbrains", "trava", "jbr"].some(v => output.includes(v));
		
		if (!hasDcevm && isWatching) {
			this.logger.config("hotswap", "padrão");
		} else if (hasDcevm) {
			this.logger.config("hotswap", "dcevm (avançado)");
		}

		const srcPath = path.join(process.cwd(), "src");
		if (fs.existsSync(srcPath)) {
			const contextPath = (config.project.appName || "").replace(".war", "");
			const endpoints = EndpointService.scan(srcPath, contextPath);
			if (endpoints.length > 0) {
				this.logger.config("endpoints", endpoints.length);
			}
		}
		this.logger.newline();
	}

	private injectContextConfiguration(appPath: string) {
		const metaInfPath = path.join(appPath, "META-INF");
		if (!fs.existsSync(metaInfPath)) fs.mkdirSync(metaInfPath, { recursive: true });

		const contextPath = path.join(metaInfPath, "context.xml");
		
		// Aumentamos o cache para 100MB (102400 KB) para evitar avisos de cache insuficiente
		const contextContent = `<?xml version="1.0" encoding="UTF-8"?>\n<Context>\n    <Resources cachingAllowed="true" cacheMaxSize="102400" />\n</Context>`;

		try {
			fs.writeFileSync(contextPath, contextContent);
			this.logger.debug(`context.xml configurado em ${contextPath}`);
		} catch (e) {
			this.logger.warn(`Não foi possível configurar context.xml: ${(e as Error).message}`);
		}
	}

	private injectHotswapProperties(appWebappPath: string) {
		const webInfClassesDir = path.join(appWebappPath, "WEB-INF", "classes");
		if (!fs.existsSync(webInfClassesDir)) fs.mkdirSync(webInfClassesDir, { recursive: true });
		
		const xavvaProps = path.join(process.cwd(), ".xavva", "hotswap-agent.properties");
		if (fs.existsSync(xavvaProps)) {
			fs.copyFileSync(xavvaProps, path.join(webInfClassesDir, "hotswap-agent.properties"));
			this.logger.debug('hotswap-agent.properties copiado');
		}
	}

	private async handleServerReady(config: AppConfig, url: string, context: string, tomcat: TomcatService, incremental: boolean) {
		try {
			await new Promise(r => setTimeout(r, 1500));
			const response = await fetch(url);
			if (response.status < 500) {
				const memory = await tomcat.getMemoryUsage();
				this.logger.divider();
				this.logger.ready("Servidor pronto");
				this.logger.url("Local", url);
				this.logger.config("Status", response.status);
				this.logger.config("Memória", memory);
				this.logger.newline();

				if (!config.project.quiet) {
					this.showEndpointMap(config.tomcat.port, context);
				}
				
				if (incremental) {
					await BrowserService.reload(url);
				} else {
					BrowserService.open(url);
				}
			} else {
				this.logger.warn(`Aplicação retornou status ${response.status}`);
			}
		} catch (e) {
			this.logger.error(`Não foi possível conectar em ${url}`);
		}
	}

	private showEndpointMap(port: number, context: string) {
		const endpoints = EndpointService.scan(path.join(process.cwd(), "src"), context);
		if (endpoints.length > 0) {
			this.logger.section("Endpoints");
			
			const apis = endpoints.filter(e => e.className !== "JSP");
			const jsps = endpoints.filter(e => e.className === "JSP");

			if (apis.length > 0) {
				this.logger.info("APIs:", "");
				const uniqueApiUrls = [...new Set(apis.map(e => `http://localhost:${port}${e.fullPath}`))];
				uniqueApiUrls.forEach(url => this.logger.info("", url));
			}

			if (jsps.length > 0) {
				this.logger.info("JSPs:", "");
				const uniqueJspUrls = [...new Set(jsps.map(e => `http://localhost:${port}${e.fullPath}`))];
				uniqueJspUrls.forEach(url => this.logger.info("", `  ${url}`));
			}
			this.logger.newline();
		}
	}

	async syncResource(config: AppConfig, filename: string): Promise<void> {
		const contextPath = (config.project.appName || "").replace(".war", "");
		const webappsPath = path.join(config.tomcat.path, "webapps");
		let appFolder = contextPath;
		
		if (!appFolder && fs.existsSync(webappsPath)) {
			const folders = fs.readdirSync(webappsPath, { withFileTypes: true })
				.filter(dirent => dirent.isDirectory() && !["ROOT", "manager", "host-manager", "docs"].includes(dirent.name));
			if (folders.length === 1) appFolder = folders[0].name;
		}

		const explodedPath = path.join(webappsPath, appFolder);
		if (!appFolder || !fs.existsSync(explodedPath)) return;

		const parts = filename.split(/[/\\]/);
		const webappIndex = parts.indexOf("webapp");
		const webContentIndex = parts.indexOf("WebContent");
		const rootIndex = webappIndex !== -1 ? webappIndex : webContentIndex;
		
		if (rootIndex !== -1) {
			const relPath = parts.slice(rootIndex + 1).join(path.sep);
			const targetPath = path.join(explodedPath, relPath);
			
			try {
				const targetDir = path.dirname(targetPath);
				if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

				fs.copyFileSync(filename, targetPath);
				this.logger.file(path.basename(filename), 'synced');
				
				const appUrl = `http://localhost:${config.tomcat.port}/${appFolder}`;
				await BrowserService.reload(appUrl);
			} catch (e) {
				this.logger.error(`Falha ao sincronizar: ${filename}`);
			}
		}
	}
}
