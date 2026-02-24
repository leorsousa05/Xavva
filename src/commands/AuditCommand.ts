import path from "path";
import fs from "fs";
import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { AuditService, type JarAuditResult } from "../services/AuditService";
import { Logger } from "../utils/ui";

export class AuditCommand implements Command {
    async execute(config: AppConfig): Promise<void> {
        Logger.section("Vulnerability & JAR Audit");

        let appName = config.project.appName;
        
        if (!appName) {
            appName = this.inferFromArtifacts();
        }

        if (!appName) {
            const webappsPath = path.join(config.tomcat.path, "webapps");
            if (fs.existsSync(webappsPath)) {
                const folders = fs.readdirSync(webappsPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory() && !["ROOT", "manager", "host-manager", "docs", "examples"].includes(dirent.name));
                
                if (folders.length === 1) {
                    appName = folders[0].name;
                } else if (folders.length > 1) {
                    Logger.error("Vários apps encontrados no Tomcat:");
                    folders.forEach(f => console.log(`    ${"\x1b[90m"}➜${"\x1b[0m"} ${f.name}`));
                    console.log(`\n  Use ${"\x1b[33m"}xavva audit -n <nome>${"\x1b[0m"} para especificar.`);
                    return;
                }
            }
        }

        if (!appName) {
            Logger.error("Não foi possível identificar o app automaticamente.");
            Logger.warn("Certifique-se de que o projeto foi buildado ou use -n <nome>.");
            return;
        }

        const auditService = new AuditService(config.tomcat);
        
        try {
            const results = await auditService.runAudit(appName);
            const vulnerable = results.filter(r => r.vulnerabilities.length > 0);

            if (vulnerable.length === 0) {
                Logger.success(`Nenhuma vulnerabilidade conhecida encontrada em ${results.length} JARs.`);
                return;
            }

            Logger.warn(`Encontradas vulnerabilidades em ${vulnerable.length} de ${results.length} dependências.`);
            console.log("");

            for (const res of vulnerable) {
                this.renderResult(res);
            }

            const totalVulns = vulnerable.reduce((acc, r) => acc + r.vulnerabilities.length, 0);
            Logger.info("Total de Falhas", totalVulns);
            Logger.info("Relatório gerado via", "OSV.dev (Open Source Vulnerability Database)");

        } catch (e: any) {
            Logger.error(e.message);
        }
    }

    private inferFromArtifacts(): string | undefined {
        const paths = ["target", "build/libs"];
        for (const p of paths) {
            const fullPath = path.join(process.cwd(), p);
            if (fs.existsSync(fullPath)) {
                const wars = fs.readdirSync(fullPath).filter(f => f.endsWith(".war"));
                if (wars.length > 0) {
                    const latest = wars.map(name => ({
                        name,
                        time: fs.statSync(path.join(fullPath, name)).mtimeMs
                    })).sort((a, b) => b.time - a.time)[0];
                    
                    return latest.name.replace(".war", "");
                }
            }
        }
        return undefined;
    }

    private renderResult(res: JarAuditResult) {
        const C = {
            reset: "\x1b[0m",
            bold: "\x1b[1m",
            dim: "\x1b[90m",
            red: "\x1b[31m",
            yellow: "\x1b[33m",
            cyan: "\x1b[36m",
            blue: "\x1b[34m"
        };

        const depName = res.groupId ? `${res.groupId}:${res.artifactId}` : res.artifactId;
        console.log(`  ${C.bold}${C.cyan}${depName}${C.reset} ${C.dim}@ ${res.version}${C.reset}`);
        console.log(`  ${C.dim}➜ ${res.jarName}${C.reset}`);

        for (const v of res.vulnerabilities) {
            let sevColor = C.reset;
            if (v.severity === "CRITICAL" || v.severity === "HIGH") sevColor = C.red;
            else if (v.severity === "MEDIUM") sevColor = C.yellow;

            console.log(`    ${sevColor}[${v.severity}]${C.reset} ${C.bold}${v.id}${C.reset}: ${v.summary}`);
            if (v.fixedIn) {
                console.log(`      ${C.blue}💡 Fixed in:${C.reset} ${C.bold}${v.fixedIn}${C.reset}`);
            }
        }
        console.log("");
    }
}
