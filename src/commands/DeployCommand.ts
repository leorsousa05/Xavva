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
            Logger.section("Deploy Configuration");
            if (config.project.quiet) {
                Logger.info("App", `${config.project.appName} (${config.project.buildTool.toUpperCase()}${config.project.profile ? ` - ${config.project.profile}` : ""})`);
                Logger.info("Status", `Watch: ${isWatching ? "ON" : "OFF"} | Debug: ${config.project.debug ? "ON" : "OFF"}`);
            } else {
                Logger.info("Tool", config.project.buildTool.toUpperCase());
                Logger.info("App Name", config.project.appName);
                if (config.project.profile) Logger.info("Profile", config.project.profile);
                Logger.info("Watch Mode", isWatching ? "Active" : "Inactive");
                Logger.info("Debug Mode", config.project.debug ? "Active" : "Inactive");
            }

            const srcPath = path.join(process.cwd(), "src");
            if (fs.existsSync(srcPath)) {
                const contextPath = (config.project.appName || "").replace(".war", "");
                const endpoints = EndpointService.scan(srcPath, contextPath);
                if (endpoints.length > 0) {
                    Logger.info("Endpoints", endpoints.length);
                }
            }
        } else {
            console.log("");
            Logger.warn("Re-deploying detected changes...");
        }
        
        try {
            const contextPath = (config.project.appName || "").replace(".war", "");

            if (!incremental) {
                await tomcat.killConflict();
            }

            if (!config.project.skipBuild) {
                await builder.runBuild(incremental);
            }

            if (incremental) {
                const appFolder = await builder.syncClasses();
                const actualContextPath = contextPath || appFolder || "";
                if (actualContextPath) {
                    const actualAppUrl = `http://localhost:${config.tomcat.port}/${actualContextPath}`;
                    await this.reloadBrowser(actualAppUrl);
                }
                return;
            }

            Logger.step("Cleaning webapps and cache");
            tomcat.clearWebapps();

            Logger.step("Moving artifacts to webapps");
            const artifact = await builder.deployToWebapps();
            
            const finalContextPath = contextPath || artifact.replace(".war", "");
            const finalAppUrl = `http://localhost:${config.tomcat.port}/${finalContextPath}`;
            
            tomcat.onReady = async () => {
                Logger.step(`Checking health at ${finalAppUrl}`);
                
                try {
                    await new Promise(r => setTimeout(r, 1500));
                    
                    const response = await fetch(finalAppUrl);
                    if (response.status < 500) {
                        const memory = await tomcat.getMemoryUsage();
                        Logger.success(`App is UP! (Status: ${response.status} | RAM: ${memory})`);

                        if (!config.project.quiet) {
                            const endpoints = EndpointService.scan(path.join(process.cwd(), "src"), finalContextPath);
                            if (endpoints.length > 0) {
                                console.log(`\n  ${"\x1b[36m"}◈ ENDPOINT MAP:${"\x1b[0m"}`);
                                endpoints.forEach(e => console.log(`    ${"\x1b[90m"}➜${"\x1b[0m"} http://localhost:${config.tomcat.port}${e.fullPath}`));
                                console.log("");
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
                        Logger.warn(`App is starting, but returned status ${response.status}. Check your logs.`);
                    }
                } catch (e) {
                    Logger.error(`Health check failed: Could not connect to ${finalAppUrl}`);
                }
            };

            tomcat.start(config.project.cleanLogs, config.project.debug, config.project.skipScan, config.project.quiet);
        } catch (error: any) {
            Logger.error(error.message);
            throw error;
        }
    }

    async syncResource(config: AppConfig, filename: string): Promise<void> {
        const appName = config.project.appName || "";
        const explodedPath = path.join(config.tomcat.path, "webapps", appName);
        
        if (!fs.existsSync(explodedPath)) {
            return;
        }

        const parts = filename.split(/[/\\]/);
        const webappIndex = parts.indexOf("webapp");
        
        if (webappIndex !== -1) {
            const relPath = parts.slice(webappIndex + 1).join(path.sep);
            const targetPath = path.join(explodedPath, relPath);
            
            try {
                fs.copyFileSync(filename, targetPath);
                if (!config.project.quiet) Logger.success(`Synced ${path.basename(filename)} directly to Tomcat!`);
                
                const contextPath = config.project.appName || "";
                const appUrl = `http://localhost:${config.tomcat.port}/${contextPath}`;
                await this.reloadBrowser(appUrl);
            } catch (e) {
                Logger.error(`Failed to sync resource: ${filename}`);
            }
        }
    }
}
