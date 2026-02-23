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
            const webappsPath = path.join(config.tomcat.path, "webapps");
            if (fs.existsSync(webappsPath)) {
                const folders = fs.readdirSync(webappsPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory() && !["ROOT", "manager", "host-manager"].includes(dirent.name));
                
                if (folders.length === 1) {
                    appName = folders[0].name;
                } else {
                    Logger.error("Vários apps encontrados. Use -n <nome> para especificar qual auditar.");
                    return;
                }
            }
        }

        if (!appName) {
            Logger.error("Nome da aplicação não definido e não pôde ser inferido.");
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
