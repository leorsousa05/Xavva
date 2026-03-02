import path from "path";
import fs from "fs";
import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { BuildService } from "../services/BuildService";
import { TomcatService } from "../services/TomcatService";
import { Logger } from "../utils/ui";
import { EndpointService } from "../services/EndpointService";
import { BrowserService } from "../services/BrowserService";

export class DeployCommand implements Command {
    constructor(private tomcat: TomcatService, private builder: BuildService) {}

    async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
        const incremental = args?.watch && args?.incremental;
        const isWatching = !!args?.watch;
        const tomcat = this.tomcat;
        const builder = this.builder;

        if (!incremental) {
            this.logConfiguration(config, isWatching);
        } else {
            Logger.watcher("Change detected", "change");
        }
        
        try {
            const contextPath = (config.project.appName || "").replace(".war", "");

            if (!incremental) {
                await tomcat.killConflict();
                await tomcat.clearWebapps();

                if (!config.project.skipBuild) {
                    Logger.watcher("Building project", "start");
                    await builder.runBuild(incremental);
                }
                
                if (!config.project.skipBuild) {
                    Logger.build("Full project build and environment ready");
                }
            } else {
                if (!config.project.skipBuild) {
                    Logger.watcher("Incremental compilation", "start");
                    await builder.runBuild(incremental);
                }
            }

            if (incremental) {
                const actualAppFolder = await builder.syncClasses(); 
                const actualContextPath = contextPath || actualAppFolder || "";
                const actualAppUrl = `http://localhost:${config.tomcat.port}/${actualContextPath}`;
                await BrowserService.reload(actualAppUrl);
                Logger.watcher("Redeploy completed", "success");
                return;
            }

            Logger.build("Webapps cleaned");
            const artifactInfo = await builder.deployToWebapps();
            Logger.build("Artifacts generated");
            
            const finalContextPath = contextPath || artifactInfo.finalName.replace(".war", "");
            const appWebappPath = path.join(config.tomcat.path, "webapps", finalContextPath);

            if (artifactInfo.isDirectory) {
                // Se é um diretório (exploded), sincronizamos o conteúdo total para a pasta do webapps
                if (!fs.existsSync(appWebappPath)) fs.mkdirSync(appWebappPath, { recursive: true });
                await builder.syncExploded(artifactInfo.path, appWebappPath);
                Logger.build("Exploded directory synced to webapps");
            } else {
                if (!fs.existsSync(appWebappPath)) fs.mkdirSync(appWebappPath, { recursive: true });

                const artifactStat = fs.statSync(artifactInfo.path);
                const webappStat = fs.existsSync(appWebappPath) ? fs.statSync(appWebappPath) : null;

                if (!webappStat || artifactStat.mtimeMs > webappStat.mtimeMs) {
                    try {
                        Bun.spawnSync(["jar", "xf", artifactInfo.path], { cwd: appWebappPath });
                        Logger.build("Artifacts deployed");
                    } catch (e) {
                        const extractCmd = `Expand-Archive -Path $env:ARTIFACT_PATH -DestinationPath $env:DEST_PATH -Force`;
                        Bun.spawnSync(["powershell", "-command", extractCmd], {
                            env: {
                                ...process.env,
                                ARTIFACT_PATH: artifactInfo.path,
                                DEST_PATH: appWebappPath
                            }
                        });
                        Logger.build("Artifacts deployed (legacy mode)");
                    }
                } else {
                    Logger.build("Webapp already up to date, skipping extraction");
                }
            }

            this.injectContextConfiguration(appWebappPath);
            this.injectHotswapProperties(appWebappPath);

            const finalAppUrl = `http://localhost:${config.tomcat.port}/${finalContextPath}`;
            
            tomcat.onReady = async () => {
                await this.handleServerReady(config, finalAppUrl, finalContextPath, tomcat, incremental);
            };

            tomcat.start(config, isWatching);
        } catch (error: any) {
            Logger.error(error.message);
            throw error;
        }
    }

    private logConfiguration(config: AppConfig, isWatching: boolean) {
        Logger.config("Runtime", config.project.buildTool.toUpperCase());
        if (config.project.profile) Logger.config("Profile", config.project.profile.toUpperCase());
        Logger.config("Watch Mode", isWatching ? "ON" : "OFF");
        Logger.config("Debug", config.project.debug ? `ON (Port ${config.project.debugPort})` : "OFF");

        let javaBin = "java";
        if (process.env.JAVA_HOME) {
            const homeBin = path.join(process.env.JAVA_HOME, "bin", "java.exe");
            if (fs.existsSync(homeBin)) javaBin = homeBin;
        }
        
        const javaVer = Bun.spawnSync([javaBin, "-version"]);
        const output = (javaVer.stderr.toString() + javaVer.stdout.toString()).toLowerCase();
        const hasDcevm = ["dcevm", "jetbrains", "trava", "jbr"].some(v => output.includes(v));
        
        if (!hasDcevm && isWatching) {
            Logger.config("Hot Reload", "Standard (No structural changes)");
        } else if (hasDcevm) {
            Logger.config("Hot Reload", "Advanced (DCEVM Active)");
        }

        const srcPath = path.join(process.cwd(), "src");
        if (fs.existsSync(srcPath)) {
            const contextPath = (config.project.appName || "").replace(".war", "");
            const endpoints = EndpointService.scan(srcPath, contextPath);
            if (endpoints.length > 0) {
                Logger.config("Endpoints", endpoints.length);
            }
        }
    }

    private injectContextConfiguration(appPath: string) {
        const metaInfPath = path.join(appPath, "META-INF");
        if (!fs.existsSync(metaInfPath)) fs.mkdirSync(metaInfPath, { recursive: true });

        const contextPath = path.join(metaInfPath, "context.xml");
        
        // Aumentamos o cache para 100MB (102400 KB) para evitar avisos de cache insuficiente
        const contextContent = `<?xml version="1.0" encoding="UTF-8"?>\n<Context>\n    <Resources cachingAllowed="true" cacheMaxSize="102400" />\n</Context>`;

        try {
            fs.writeFileSync(contextPath, contextContent);
        } catch (e) {}
    }

    private injectHotswapProperties(appWebappPath: string) {
        const webInfClassesDir = path.join(appWebappPath, "WEB-INF", "classes");
        if (!fs.existsSync(webInfClassesDir)) fs.mkdirSync(webInfClassesDir, { recursive: true });
        
        const xavvaProps = path.join(process.cwd(), ".xavva", "hotswap-agent.properties");
        if (fs.existsSync(xavvaProps)) {
            fs.copyFileSync(xavvaProps, path.join(webInfClassesDir, "hotswap-agent.properties"));
        }
    }

    private async handleServerReady(config: AppConfig, url: string, context: string, tomcat: TomcatService, incremental: boolean) {
        try {
            await new Promise(r => setTimeout(r, 1500));
            const response = await fetch(url);
            if (response.status < 500) {
                const memory = await tomcat.getMemoryUsage();
                Logger.health(url, "success");
                Logger.health(`Status ${response.status}`, "success");
                Logger.health(`Memory ${memory}`, "success");

                if (!config.project.quiet) {
                    this.showEndpointMap(config.tomcat.port, context);
                }
                
                if (incremental) {
                    await BrowserService.reload(url);
                } else {
                    BrowserService.open(url);
                }
            } else {
                Logger.health(`App returned status ${response.status}`, "warn");
            }
        } catch (e) {
            Logger.health(`Could not connect to ${url}`, "error");
        }
    }

    private showEndpointMap(port: number, context: string) {
        const endpoints = EndpointService.scan(path.join(process.cwd(), "src"), context);
        if (endpoints.length > 0) {
            Logger.newline();
            Logger.log(`${Logger.C.cyan}◈ ENDPOINT MAP:${Logger.C.reset}`);
            
            const apis = endpoints.filter(e => e.className !== "JSP");
            const jsps = endpoints.filter(e => e.className === "JSP");

            if (apis.length > 0) {
                const uniqueApiUrls = [...new Set(apis.map(e => `http://localhost:${port}${e.fullPath}`))];
                uniqueApiUrls.forEach(url => Logger.log(`${Logger.C.dim}➜ ${Logger.C.reset}${url}`));
            }

            if (jsps.length > 0) {
                Logger.log(`${Logger.C.dim}--- JSPs ---${Logger.C.reset}`);
                const uniqueJspUrls = [...new Set(jsps.map(e => `http://localhost:${port}${e.fullPath}`))];
                uniqueJspUrls.forEach(url => Logger.log(`${Logger.C.dim}📄 ${Logger.C.reset}${url}`));
            }
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
                if (!config.project.quiet) Logger.success(`Synced ${path.basename(filename)} directly to Tomcat!`);
                
                const appUrl = `http://localhost:${config.tomcat.port}/${appFolder}`;
                await BrowserService.reload(appUrl);
            } catch (e) {
                Logger.error(`Failed to sync resource: ${filename}`);
            }
        }
    }
}
