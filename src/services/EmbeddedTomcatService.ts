import { Logger } from "../utils/ui";
import { existsSync, mkdirSync, createWriteStream, writeFileSync, promises as fs } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

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

    // Versões estáveis do Tomcat
    private static readonly VERSIONS: Record<string, { url: string; sha512: string }> = {
        "10.1.28": {
            url: "https://dlcdn.apache.org/tomcat/tomcat-10/v10.1.28/bin/apache-tomcat-10.1.28-windows-x64.zip",
            sha512: ""
        },
        "9.0.93": {
            url: "https://dlcdn.apache.org/tomcat/tomcat-9/v9.0.93/bin/apache-tomcat-9.0.93-windows-x64.zip",
            sha512: ""
        },
        "11.0.0-M24": {
            url: "https://dlcdn.apache.org/tomcat/tomcat-11/v11.0.0-M24/bin/apache-tomcat-11.0.0-M24-windows-x64.zip",
            sha512: ""
        }
    };

    constructor(options: EmbeddedTomcatOptions) {
        this.version = options.version || "10.1.28";
        this.port = options.port || 8080;
        this.webappPath = path.resolve(options.webappPath);
        this.contextPath = options.contextPath || "/";
        this.baseDir = path.join(os.homedir(), ".xavva", "tomcat");
        this.tomcatHome = path.join(this.baseDir, this.version);
        
        // Se a versão não está na lista, usa URL padrão
        const versionInfo = EmbeddedTomcatService.VERSIONS[this.version];
        if (versionInfo) {
            this.downloadUrl = versionInfo.url;
        } else {
            // Tenta inferir URL baseado no padrão Apache
            const majorVersion = this.version.split(".")[0];
            this.downloadUrl = `https://archive.apache.org/dist/tomcat/tomcat-${majorVersion}/v${this.version}/bin/apache-tomcat-${this.version}-windows-x64.zip`;
        }
    }

    /**
     * Verifica se o Tomcat já está instalado
     */
    checkInstallation(): boolean {
        const catalinaBat = path.join(this.tomcatHome, "bin", "catalina.bat");
        this.isInstalled = existsSync(catalinaBat);
        return this.isInstalled;
    }

    /**
     * Retorna o caminho do Tomcat (instalado ou para instalar)
     */
    getTomcatHome(): string {
        return this.tomcatHome;
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

        const zipPath = path.join(this.baseDir, `apache-tomcat-${this.version}.zip`);

        try {
            // Download
            await this.downloadFile(this.downloadUrl, zipPath);

            // Extração
            await this.extractZip(zipPath, this.baseDir);

            // Renomeia diretório extraído para versão padronizada
            const extractedDir = path.join(this.baseDir, `apache-tomcat-${this.version}`);
            if (existsSync(extractedDir) && extractedDir !== this.tomcatHome) {
                await fs.rename(extractedDir, this.tomcatHome);
            }

            // Limpa arquivo zip
            await fs.unlink(zipPath).catch(() => {});

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
                await fs.rm(this.tomcatHome, { recursive: true, force: true });
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

        let content = await fs.readFile(serverXmlPath, "utf-8");

        // Atualiza porta HTTP
        content = content.replace(
            /<Connector port="8080"/,
            `<Connector port="${this.port}"`
        );

        // Atualiza porta de shutdown
        const shutdownPort = this.port + 1000;
        content = content.replace(
            /<Server port="8005"/,
            `<Server port="${shutdownPort}"`
        );

        // Atualiza porta AJP (se existir)
        content = content.replace(
            /<Connector port="8009"/,
            `<Connector port="${this.port + 1001}"`
        );

        // Desabilita manager e host-manager em embedded (opcional)
        // Remove context do manager para segurança
        content = content.replace(
            /<Context docBase="manager"[^>]*\/>/g,
            "<!-- <Context docBase=\"manager\" ... /> -->"
        );

        await fs.writeFile(serverXmlPath, content, "utf-8");
        Logger.debug(`server.xml configurado na porta ${this.port}`);
    }

    /**
     * Configura context.xml para hot-reload
     */
    private async configureContextXml(): Promise<void> {
        const contextXmlPath = path.join(this.tomcatHome, "conf", "context.xml");
        
        if (!existsSync(contextXmlPath)) return;

        let content = await fs.readFile(contextXmlPath, "utf-8");

        // Adiciona atributos para hot-reload se não existirem
        if (!content.includes("reloadable")) {
            content = content.replace(
                /<Context>/,
                '<Context reloadable="true" autoDeploy="true" deployOnStartup="true">'
            );
        }

        await fs.writeFile(contextXmlPath, content, "utf-8");
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
                await fs.rm(appPath, { recursive: true, force: true });
            }
        }

        // Cria diretório para a aplicação
        const appName = this.contextPath === "/" ? "ROOT" : this.contextPath.replace(/^\//, "");
        const appDir = path.join(webappsDir, appName);

        if (existsSync(appDir)) {
            await fs.rm(appDir, { recursive: true, force: true });
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
            const netstat = spawn("cmd", ["/c", `netstat -ano | findstr :${this.port}`]);
            let output = "";

            netstat.stdout?.on("data", (data) => {
                output += data.toString();
            });

            netstat.on("close", () => {
                resolve(output.trim().length === 0);
            });

            netstat.on("error", () => {
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
            CATALINA_OPTS: process.env.CATALINA_OPTS || ""
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
     * Extrai arquivo ZIP usando PowerShell
     */
    private async extractZip(zipPath: string, destDir: string): Promise<void> {
        const spinner = Logger.spinner("Extraindo arquivos...");

        return new Promise((resolve, reject) => {
            const ps = spawn("powershell", [
                "-command",
                `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
            ]);

            ps.on("close", (code) => {
                if (code === 0) {
                    spinner(true);
                    resolve();
                } else {
                    spinner(false);
                    reject(new Error(`Falha ao extrair (código ${code})`));
                }
            });

            ps.on("error", (err) => {
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
            await fs.rm(this.tomcatHome, { recursive: true, force: true });
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
            context: this.contextPath
        };
    }
}
