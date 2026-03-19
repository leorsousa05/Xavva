import { exec } from "child_process";
import { promisify } from "util";
import { platform, totalmem, freemem, arch } from "os";
import { existsSync } from "fs";
import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../utils/ui";

const execAsync = promisify(exec);

interface HealthCheck {
    name: string;
    status: "ok" | "warning" | "error";
    message: string;
    details?: string;
}

export class HealthCommand implements Command {
    async execute(config: AppConfig, _args?: CLIArguments): Promise<void> {
        Logger.banner("health");
        Logger.section("Verificando saúde do ambiente");

        const checks: HealthCheck[] = [];

        // Java
        checks.push(await this.checkJava());

        // Maven/Gradle
        checks.push(await this.checkBuildTool(config.project.buildTool));

        // Tomcat
        checks.push(await this.checkTomcat(config));

        // Portas
        checks.push(await this.checkPorts(config.tomcat.port));

        // Memória
        checks.push(this.checkMemory());

        // Disco
        checks.push(await this.checkDisk());

        // Git
        checks.push(this.checkGit());

        // Exibir resultados
        Logger.newline();
        let errors = 0;
        let warnings = 0;

        for (const check of checks) {
            const icon = check.status === "ok" 
                ? `${Logger.C.success}✓${Logger.C.reset}`
                : check.status === "warning"
                ? `${Logger.C.warning}⚠${Logger.C.reset}`
                : `${Logger.C.error}✗${Logger.C.reset}`;

            Logger.log(`${Logger.C.gray}│${Logger.C.reset}  ${icon} ${Logger.C.bold}${check.name}${Logger.C.reset}`);
            Logger.log(`${Logger.C.gray}│${Logger.C.reset}     ${check.message}`);
            
            if (check.details) {
                Logger.log(`${Logger.C.gray}│${Logger.C.reset}     ${Logger.C.dim}${check.details}${Logger.C.reset}`);
            }

            if (check.status === "error") errors++;
            if (check.status === "warning") warnings++;
        }

        Logger.endSection();

        // Summary
        if (errors === 0 && warnings === 0) {
            Logger.ready("Ambiente saudável! ✓");
        } else if (errors === 0) {
            Logger.warn(`${warnings} aviso(s) encontrado(s)`);
        } else {
            Logger.error(`${errors} erro(s) encontrado(s)`);
        }
    }

    private async checkJava(): Promise<HealthCheck> {
        try {
            const { stdout, stderr } = await execAsync("java -version");
            const output = stderr || stdout;
            const versionMatch = output.match(/version "?(\d+\.?\d*)/);
            const version = versionMatch ? versionMatch[1] : "unknown";
            const isDCEVM = output.toLowerCase().includes("dcevm") || output.toLowerCase().includes("jbr");
            
            const majorVersion = parseInt(version.split(".")[0]);
            const status = majorVersion >= 11 ? "ok" : "warning";
            
            return {
                name: "Java",
                status,
                message: `v${version}${isDCEVM ? " + DCEVM" : ""}`,
                details: isDCEVM ? "Hot-reload disponível" : "Considere instalar DCEVM para hot-reload"
            };
        } catch {
            return {
                name: "Java",
                status: "error",
                message: "Java não encontrado",
                details: "Instale o JDK 11+ e configure JAVA_HOME"
            };
        }
    }

    private async checkBuildTool(tool: string): Promise<HealthCheck> {
        try {
            if (tool === "maven") {
                const { stdout } = await execAsync("mvn -version");
                const version = stdout.match(/Apache Maven (\d+\.\d+\.\d+)/)?.[1] || "unknown";
                return {
                    name: "Maven",
                    status: "ok",
                    message: `v${version}`
                };
            } else {
                const { stdout } = await execAsync("gradle --version");
                const version = stdout.match(/Gradle (\d+\.\d+\.\d+)/)?.[1] || "unknown";
                return {
                    name: "Gradle",
                    status: "ok",
                    message: `v${version}`
                };
            }
        } catch {
            return {
                name: tool === "maven" ? "Maven" : "Gradle",
                status: "error",
                message: `${tool === "maven" ? "mvn" : "gradle"} não encontrado`,
                details: `Instale ${tool === "maven" ? "Maven" : "Gradle"} e adicione ao PATH`
            };
        }
    }

    private async checkTomcat(config: AppConfig): Promise<HealthCheck> {
        if (config.tomcat.embedded) {
            return {
                name: "Tomcat",
                status: "ok",
                message: `Embutido v${config.tomcat.version || "10.1.52"}`,
                details: "Auto-download habilitado"
            };
        }

        if (existsSync(config.tomcat.path)) {
            const versionFile = `${config.tomcat.path}/bin/version.sh`;
            const versionBat = `${config.tomcat.path}/bin/version.bat`;
            
            try {
                const cmd = existsSync(versionBat) ? versionBat : versionFile;
                const { stdout } = await execAsync(cmd);
                const version = stdout.match(/Server version: Apache Tomcat\/(\d+\.\d+\.\d+)/)?.[1] || "unknown";
                return {
                    name: "Tomcat",
                    status: "ok",
                    message: `v${version}`,
                    details: config.tomcat.path
                };
            } catch {
                return {
                    name: "Tomcat",
                    status: "warning",
                    message: "Caminho existe mas não foi possível verificar versão",
                    details: config.tomcat.path
                };
            }
        }

        return {
            name: "Tomcat",
            status: "error",
            message: "Caminho não encontrado",
            details: `Configure CATALINA_HOME ou use Tomcat embutido`
        };
    }

    private async checkPorts(port: number): Promise<HealthCheck> {
        try {
            let cmd: string;
            if (platform() === "win32") {
                cmd = `netstat -an | findstr :${port}`;
            } else if (platform() === "darwin") {
                cmd = `lsof -i :${port}`;
            } else {
                cmd = `ss -tuln | grep :${port}`;
            }

            const { stdout } = await execAsync(cmd);
            const isInUse = stdout.trim().length > 0;

            if (isInUse) {
                return {
                    name: "Portas",
                    status: "warning",
                    message: `Porta ${port} em uso`,
                    details: "Outro processo pode estar usando a porta"
                };
            }

            return {
                name: "Portas",
                status: "ok",
                message: `Porta ${port} disponível`
            };
        } catch {
            // Comando falhou, assume que porta está livre
            return {
                name: "Portas",
                status: "ok",
                message: `Porta ${port} parece disponível`
            };
        }
    }

    private checkMemory(): HealthCheck {
        const total = totalmem();
        const free = freemem();
        const used = total - free;
        const percentUsed = Math.round((used / total) * 100);
        const freeGB = (free / 1024 / 1024 / 1024).toFixed(1);
        const totalGB = (total / 1024 / 1024 / 1024).toFixed(1);

        const status = percentUsed > 90 ? "warning" : "ok";

        return {
            name: "Memória",
            status,
            message: `${freeGB}GB livre de ${totalGB}GB`,
            details: `${percentUsed}% em uso`
        };
    }

    private async checkDisk(): Promise<HealthCheck> {
        try {
            let cmd: string;
            if (platform() === "win32") {
                cmd = "wmic logicaldisk get size,freespace,caption";
            } else {
                cmd = "df -h .";
            }

            const { stdout } = await execAsync(cmd);
            
            if (platform() === "win32") {
                const lines = stdout.trim().split("\n").slice(1);
                const mainDisk = lines.find(l => l.includes(":")) || "";
                const parts = mainDisk.trim().split(/\s+/);
                if (parts.length >= 3) {
                    const free = parseInt(parts[0]) / 1024 / 1024 / 1024;
                    const total = parseInt(parts[1]) / 1024 / 1024 / 1024;
                    const percentFree = Math.round((free / total) * 100);
                    
                    return {
                        name: "Disco",
                        status: percentFree < 10 ? "warning" : "ok",
                        message: `${free.toFixed(1)}GB livre`,
                        details: `${percentFree}% disponível`
                    };
                }
            } else {
                const match = stdout.match(/(\d+)%/);
                if (match) {
                    const used = parseInt(match[1]);
                    return {
                        name: "Disco",
                        status: used > 90 ? "warning" : "ok",
                        message: `${100 - used}% disponível`,
                        details: stdout.split("\n")[1]?.split(/\s+/).pop() || ""
                    };
                }
            }

            throw new Error("Could not parse disk info");
        } catch {
            return {
                name: "Disco",
                status: "warning",
                message: "Não foi possível verificar",
                details: "Verifique manualmente"
            };
        }
    }

    private checkGit(): HealthCheck {
        if (existsSync(".git")) {
            return {
                name: "Git",
                status: "ok",
                message: "Repositório Git detectado"
            };
        }

        return {
            name: "Git",
            status: "warning",
            message: "Sem repositório Git",
            details: "Execute 'git init' para versionamento"
        };
    }
}
