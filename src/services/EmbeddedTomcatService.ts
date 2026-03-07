import { Logger } from "../utils/ui";
import {
	existsSync,
	mkdirSync,
	createWriteStream,
	writeFileSync,
	readdirSync,
	promises as fsPromises,
} from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import {
	getPlatform,
	isWindows,
	getTomcatArchiveName,
	getTomcatDownloadUrl,
	getTomcatArchiveUrl,
	getExtractCommand,
	getPortCheckCommand,
	getCatalinaScript,
	hasCatalinaScript,
} from "../utils/platform";

export interface EmbeddedTomcatOptions {
	version?: string;
	port?: number;
	webappPath: string;
	contextPath?: string;
}

interface DownloadProgress {
	downloaded: number;
	total: number;
	percent: number;
}

export class EmbeddedTomcatService {
	private readonly baseDir: string;
	private readonly version: string;
	private port: number;
	private webappPath: string;
	private contextPath: string;
	private tomcatHome: string;
	private downloadUrl: string;
	private isInstalled: boolean = false;

	// Versões estáveis do Tomcat (atualizadas: 2026-03-04)
	// URLs são construídas dinamicamente baseadas na plataforma
	private static readonly VERSIONS: Record<
		string,
		{ sha512: string }
	> = {
			"10.1.52": {
				sha512: "",
			},
			"9.0.115": {
				sha512: "",
			},
			"11.0.18": {
				sha512: "",
			},
		};

	constructor(options: EmbeddedTomcatOptions) {
		this.version = options.version || "10.1.52";
		this.port = options.port || 8080;
		this.webappPath = path.resolve(options.webappPath);
		this.contextPath = options.contextPath || "/";
		this.baseDir = path.join(os.homedir(), ".xavva", "tomcat");
		this.tomcatHome = path.join(this.baseDir, this.version);

		// Constrói URL de download baseada na plataforma
		const versionInfo = EmbeddedTomcatService.VERSIONS[this.version];
		if (versionInfo) {
			// Usa URL primária (CDN Apache)
			this.downloadUrl = getTomcatDownloadUrl(this.version);
		} else {
			// Tenta inferir URL baseado no padrão Apache (archive)
			this.downloadUrl = getTomcatArchiveUrl(this.version);
		}
	}

	/**
	 * Verifica se o Tomcat já está instalado
	 */
	checkInstallation(): boolean {
		this.isInstalled = hasCatalinaScript(this.tomcatHome);
		return this.isInstalled;
	}

	/**
	 * Retorna o caminho do Tomcat (instalado ou para instalar)
	 */
	getTomcatHome(): string {
		return this.tomcatHome;
	}

	/**
	 * Lista todas as versões instaladas
	 */
	static listInstalledVersions(): string[] {
		const baseDir = path.join(os.homedir(), ".xavva", "tomcat");
		if (!existsSync(baseDir)) return [];

		const versions: string[] = [];
		const entries = readdirSync(baseDir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isDirectory()) {
				const tomcatPath = path.join(baseDir, entry.name);
				if (hasCatalinaScript(tomcatPath)) {
					versions.push(entry.name);
				}
			}
		}

		return versions.sort();
	}

	/**
	 * Baixa e instala o Tomcat
	 */
	async install(): Promise<boolean> {
		if (this.checkInstallation()) {
			Logger.info("Tomcat", `Versão ${this.version} já instalada`);
			return true;
		}

		Logger.section("Instalando Tomcat Embutido");
		Logger.info("Versão", this.version);
		Logger.info("Destino", this.tomcatHome);

		// Cria diretório base
		if (!existsSync(this.baseDir)) {
			mkdirSync(this.baseDir, { recursive: true });
		}

		const archiveName = getTomcatArchiveName(this.version);
		const zipPath = path.join(this.baseDir, archiveName);

		try {
			// Download
			await this.downloadFile(this.downloadUrl, zipPath);

			// Extração
			await this.extractZip(zipPath, this.baseDir);

			// Renomeia diretório extraído para versão padronizada
			const extractedDir = path.join(
				this.baseDir,
				`apache-tomcat-${this.version}`,
			);
			if (existsSync(extractedDir) && extractedDir !== this.tomcatHome) {
				await fsPromises.rename(extractedDir, this.tomcatHome);
			}

			// Limpa arquivo zip
			await fsPromises.unlink(zipPath).catch(() => { });

			// Configura server.xml
			await this.configureServerXml();

			// Configura context.xml para hot-reload
			await this.configureContextXml();

			this.isInstalled = true;
			Logger.success(`Tomcat ${this.version} instalado com sucesso!`);
			return true;
		} catch (error) {
			Logger.error(`Falha ao instalar Tomcat: ${error}`);
			// Limpa arquivos parciais
			if (existsSync(this.tomcatHome)) {
				await fsPromises.rm(this.tomcatHome, { recursive: true, force: true });
			}
			return false;
		}
	}

	/**
	 * Configura server.xml com porta personalizada
	 */
	private async configureServerXml(): Promise<void> {
		const serverXmlPath = path.join(this.tomcatHome, "conf", "server.xml");

		if (!existsSync(serverXmlPath)) {
			throw new Error("server.xml não encontrado após extração");
		}

		let content = await fsPromises.readFile(serverXmlPath, "utf-8");

		// Atualiza porta HTTP
		content = content.replace(
			/<Connector port="8080"/,
			`<Connector port="${this.port}"`,
		);

		// Atualiza porta de shutdown
		const shutdownPort = this.port + 1000;
		content = content.replace(
			/<Server port="8005"/,
			`<Server port="${shutdownPort}"`,
		);

		// Atualiza porta AJP (se existir)
		content = content.replace(
			/<Connector port="8009"/,
			`<Connector port="${this.port + 1001}"`,
		);

		// Desabilita manager e host-manager em embedded (opcional)
		// Remove context do manager para segurança
		content = content.replace(
			/<Context docBase="manager"[^>]*\/>/g,
			'<!-- <Context docBase="manager" ... /> -->',
		);

		await fsPromises.writeFile(serverXmlPath, content, "utf-8");
		Logger.debug(`server.xml configurado na porta ${this.port}`);
	}

	/**
	 * Configura context.xml para hot-reload
	 */
	private async configureContextXml(): Promise<void> {
		const contextXmlPath = path.join(this.tomcatHome, "conf", "context.xml");

		if (!existsSync(contextXmlPath)) return;

		let content = await fsPromises.readFile(contextXmlPath, "utf-8");

		// Adiciona atributos para hot-reload se não existirem
		if (!content.includes("reloadable")) {
			content = content.replace(
				/<Context>/,
				'<Context reloadable="true" autoDeploy="true" deployOnStartup="true">',
			);
		}

		await fsPromises.writeFile(contextXmlPath, content, "utf-8");
	}

	/**
	 * Cria contexto para a aplicação
	 */
	async createAppContext(): Promise<void> {
		const webappsDir = path.join(this.tomcatHome, "webapps");

		// Limpa webapps padrão
		const defaultApps = ["docs", "examples", "host-manager", "manager", "ROOT"];
		for (const app of defaultApps) {
			const appPath = path.join(webappsDir, app);
			if (existsSync(appPath)) {
				await fsPromises.rm(appPath, { recursive: true, force: true });
			}
		}

		// Cria diretório para a aplicação
		const appName =
			this.contextPath === "/" ? "ROOT" : this.contextPath.replace(/^\//, "");
		const appDir = path.join(webappsDir, appName);

		if (existsSync(appDir)) {
			await fsPromises.rm(appDir, { recursive: true, force: true });
		}

		// Se webappPath é um diretório, cria link/simula deploy
		if (existsSync(this.webappPath)) {
			// Em Windows, vamos copiar inicialmente (symlink requer privilégios)
			// Ou criar um context XML apontando para o diretório
			await this.createContextXml(appName);
		}
	}

	/**
	 * Cria arquivo context XML para apontar para diretório externo
	 */
	private async createContextXml(appName: string): Promise<void> {
		const confDir = path.join(this.tomcatHome, "conf", "Catalina", "localhost");

		if (!existsSync(confDir)) {
			mkdirSync(confDir, { recursive: true });
		}

		const contextFile = path.join(confDir, `${appName}.xml`);
		const content = `<?xml version="1.0" encoding="UTF-8"?>
<Context 
    docBase="${this.webappPath.replace(/\\/g, "/")}"
    reloadable="true"
    crossContext="true"
    antiResourceLocking="false"
    antiJARLocking="false">
</Context>`;

		writeFileSync(contextFile, content);
		Logger.debug(`Context criado: ${contextFile}`);
	}

	/**
	 * Verifica se porta está disponível
	 */
	async isPortAvailable(): Promise<boolean> {
		return new Promise((resolve) => {
			const cmd = getPortCheckCommand(this.port);
			const checkProcess = spawn(cmd[0], cmd.slice(1));
			let output = "";

			checkProcess.stdout?.on("data", (data) => {
				output += data.toString();
			});

			checkProcess.stderr?.on("data", (data) => {
				output += data.toString();
			});

			checkProcess.on("close", () => {
				// Se houver output, a porta está em uso
				resolve(output.trim().length === 0);
			});

			checkProcess.on("error", () => {
				resolve(true); // Assume disponível se não conseguir verificar
			});
		});
	}

	/**
	 * Encontra próxima porta disponível
	 */
	async findAvailablePort(startPort: number = 8080): Promise<number> {
		let port = startPort;
		while (!(await this.isPortAvailable())) {
			port++;
			if (port > 65535) {
				throw new Error("Nenhuma porta disponível encontrada");
			}
		}
		this.port = port;
		return port;
	}

	/**
	 * Retorna variáveis de ambiente para o Tomcat
	 */
	getEnvironment(): Record<string, string> {
		return {
			CATALINA_HOME: this.tomcatHome,
			CATALINA_BASE: this.tomcatHome,
			CATALINA_OPTS: process.env.CATALINA_OPTS || "",
		};
	}

	/**
	 * Lista versões disponíveis
	 */
	static getAvailableVersions(): string[] {
		return Object.keys(EmbeddedTomcatService.VERSIONS);
	}

	/**
	 * Download com progresso
	 */
	private async downloadFile(url: string, destPath: string): Promise<void> {
		const spinner = Logger.spinner(`Baixando Tomcat ${this.version}...`);

		try {
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const totalSize = parseInt(response.headers.get("content-length") || "0");
			const buffer = await response.arrayBuffer();

			writeFileSync(destPath, Buffer.from(buffer));

			spinner(true);

			const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1);
			Logger.info("Download", `${sizeMB} MB baixados`);
		} catch (error) {
			spinner(false);
			throw error;
		}
	}

	/**
	 * Extrai arquivo de arquivos (ZIP ou tar.gz)
	 */
	private async extractZip(zipPath: string, destDir: string): Promise<void> {
		const spinner = Logger.spinner("Extraindo arquivos...");

		return new Promise((resolve, reject) => {
			const cmd = getExtractCommand(zipPath, destDir);
			
			if (!cmd) {
				spinner(false);
				reject(new Error(`Formato de arquivo não suportado: ${path.extname(zipPath)}`));
				return;
			}

			const extractProcess = spawn(cmd[0], cmd.slice(1));

			extractProcess.on("close", (code) => {
				if (code === 0) {
					spinner(true);
					resolve();
				} else {
					spinner(false);
					reject(new Error(`Falha ao extrair (código ${code})`));
				}
			});

			extractProcess.on("error", (err) => {
				spinner(false);
				reject(err);
			});
		});
	}

	/**
	 * Remove instalação
	 */
	async uninstall(): Promise<void> {
		if (existsSync(this.tomcatHome)) {
			await fsPromises.rm(this.tomcatHome, { recursive: true, force: true });
			Logger.info("Tomcat", `Versão ${this.version} removida`);
		}
	}

	/**
	 * Retorna informações da instalação
	 */
	getInfo(): Record<string, string> {
		return {
			version: this.version,
			home: this.tomcatHome,
			port: String(this.port),
			installed: this.isInstalled ? "sim" : "não",
			webapp: this.webappPath,
			context: this.contextPath,
		};
	}
}
