import path from "path";
import fs from "fs";
import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { BuildService } from "../services/BuildService";
import { TomcatService } from "../services/TomcatService";
import { Logger } from "../utils/ui";
import { EndpointService } from "../services/EndpointService";

export class DeployCommand implements Command {
    constructor(private tomcat?: TomcatService, private builder?: BuildService) {}

    private async reloadBrowser(url: string) {
        if (process.platform !== 'win32') return;
        
        await new Promise(r => setTimeout(r, 800));

        const psCommand = `
            $shell = New-Object -ComObject WScript.Shell
            $process = Get-Process | Where-Object { $_.MainWindowTitle -match "Chrome" -or $_.MainWindowTitle -match "Edge" } | Select-Object -First 1
            if ($process) {
                $shell.AppActivate($process.Id)
                Sleep -m 100
                $shell.SendKeys("{F5}")
            }
        `;
        Bun.spawn(["powershell", "-command", psCommand]);
    }

    async execute(config: AppConfig, incremental = false, isWatching = false): Promise<void> {
        const tomcat = this.tomcat || new TomcatService(config.tomcat);
        const builder = this.builder || new BuildService(config.project, config.tomcat);

        if (!incremental) {
            Logger.config("Runtime", config.project.buildTool.toUpperCase());
            Logger.config("Watch Mode", isWatching ? "ON" : "OFF");
            Logger.config("Debug", config.project.debug ? "ON (Port 5005)" : "OFF");

            let javaBin = "java";
            if (process.env.JAVA_HOME) {
                const homeBin = path.join(process.env.JAVA_HOME, "bin", "java.exe");
                if (fs.existsSync(homeBin)) javaBin = homeBin;
            }
            
            const javaVer = Bun.spawnSync([javaBin, "-version"]);
            const output = (javaVer.stderr.toString() + javaVer.stdout.toString()).toLowerCase();
            const hasDcevm = output.includes("dcevm") || 
                             output.includes("jetbrains") || 
                             output.includes("trava") || 
                             output.includes("jbr");
            
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
        } else {
            Logger.watcher("Change detected", "change");
        }
        
        try {
            const contextPath = (config.project.appName || "").replace(".war", "");

            if (!incremental) {
                await tomcat.killConflict();
            }

            if (!config.project.skipBuild) {
                if (incremental) Logger.watcher("Incremental compilation", "start");
                await builder.runBuild(incremental);
                if (!incremental) Logger.build("Full project build");
            }

            if (incremental) {
                const actualAppFolder = await builder.syncClasses(true); 
                const actualContextPath = contextPath || actualAppFolder || "";
                const actualAppUrl = `http://localhost:${config.tomcat.port}/${actualContextPath}`;
                await this.reloadBrowser(actualAppUrl);
                Logger.watcher("Redeploy completed", "success");
                return;
            }

            Logger.build("Webapps cleaned");
            const artifactInfo = await builder.deployToWebapps();
            Logger.build("Artifacts generated");
            
            const finalContextPath = contextPath || artifactInfo.finalName.replace(".war", "");
            const appWebappPath = path.join(config.tomcat.path, "webapps", finalContextPath);

            if (!fs.existsSync(appWebappPath)) fs.mkdirSync(appWebappPath, { recursive: true });

            try {
                Bun.spawnSync(["jar", "xf", artifactInfo.path], { cwd: appWebappPath });
                Logger.build("Artifacts deployed");
            } catch (e: any) {
                const extractCmd = `powershell -command "Expand-Archive -Path '${artifactInfo.path}' -DestinationPath '${appWebappPath}' -Force"`;
                Bun.spawnSync(["powershell", "-command", extractCmd]);
                Logger.build("Artifacts deployed (legacy mode)");
            }

            const webInfClassesDir = path.join(appWebappPath, "WEB-INF", "classes");
            if (!fs.existsSync(webInfClassesDir)) fs.mkdirSync(webInfClassesDir, { recursive: true });
            
            const xavvaProps = path.join(process.cwd(), ".xavva", "hotswap-agent.properties");
            if (fs.existsSync(xavvaProps)) {
                fs.copyFileSync(xavvaProps, path.join(webInfClassesDir, "hotswap-agent.properties"));
            }

            const finalAppUrl = `http://localhost:${config.tomcat.port}/${finalContextPath}`;
            
            tomcat.onReady = async () => {
                try {
                    await new Promise(r => setTimeout(r, 1500));
                    const response = await fetch(finalAppUrl);
                    if (response.status < 500) {
                        const memory = await tomcat.getMemoryUsage();
                        Logger.health(finalAppUrl, "success");
                        Logger.health(`Status ${response.status}`, "success");
                        Logger.health(`Memory ${memory}`, "success");

                        if (!config.project.quiet) {
                            const endpoints = EndpointService.scan(path.join(process.cwd(), "src"), finalContextPath);
                            if (endpoints.length > 0) {
                                Logger.newline();
                                Logger.log(`${Logger.C.cyan}◈ ENDPOINT MAP:${Logger.C.reset}`);
                                endpoints.forEach(e => Logger.log(`${Logger.C.dim}➜ ${Logger.C.reset}http://localhost:${config.tomcat.port}${e.fullPath}`));
                            }
                        }
                        
                        if (incremental) {
                            await this.reloadBrowser(finalAppUrl);
                        } else {
                            if (process.platform === 'win32') {
                                Bun.spawn(["cmd", "/c", "start", finalAppUrl]);
                            } else {
                                const start = process.platform === 'darwin' ? 'open' : 'xdg-open';
                                Bun.spawn([start, finalAppUrl]);
                            }
                        }
                    } else {
                        Logger.health(`App returned status ${response.status}`, "warn");
                    }
                } catch (e) {
                    Logger.health(`Could not connect to ${finalAppUrl}`, "error");
                }
            };

            tomcat.start(config, isWatching);
        } catch (error: any) {
            Logger.error(error.message);
            throw error;
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
        
        if (!appFolder || !fs.existsSync(explodedPath)) {
            return;
        }

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
                await this.reloadBrowser(appUrl);
            } catch (e) {
                Logger.error(`Failed to sync resource: ${filename}`);
            }
        }
    }
}
