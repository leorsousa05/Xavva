import fs from "fs";
import path from "path";
import type { TomcatConfig } from "../types/config";
import { Logger } from "../utils/ui";

export interface Vulnerability {
    id: string;
    summary: string;
    details: string;
    severity: string;
    fixedIn?: string;
}

export interface JarAuditResult {
    jarName: string;
    groupId?: string;
    artifactId?: string;
    version?: string;
    vulnerabilities: Vulnerability[];
}

export class AuditService {
    constructor(private tomcatConfig: TomcatConfig) {}

    async runAudit(appName: string): Promise<JarAuditResult[]> {
        const libPath = path.join(this.tomcatConfig.path, "webapps", appName, "WEB-INF", "lib");
        
        if (!fs.existsSync(libPath)) {
            throw new Error(`Pasta lib não encontrada em: ${libPath}. Faça o deploy da aplicação primeiro.`);
        }

        const jars = fs.readdirSync(libPath).filter(f => f.endsWith(".jar"));
        const results: JarAuditResult[] = [];

        const stopSpinner = Logger.spinner(`Auditando ${jars.length} dependências`);

        // Process in chunks to avoid overwhelming the API
        const chunkSize = 10;
        for (let i = 0; i < jars.length; i += chunkSize) {
            const chunk = jars.slice(i, i + chunkSize);
            const chunkPromises = chunk.map(jar => this.auditJar(path.join(libPath, jar)));
            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);
        }

        stopSpinner();
        return results;
    }

    private async auditJar(jarPath: string): Promise<JarAuditResult> {
        const jarName = path.basename(jarPath);
        const info = await this.extractJarInfo(jarPath);
        
        if (!info.artifactId || !info.version) {
            // Fallback to filename parsing if pom.properties is missing
            const match = jarName.match(/(.+)-([\d\.]+.*)\.jar/);
            if (match) {
                info.artifactId = info.artifactId || match[1];
                info.version = info.version || match[2];
            }
        }

        const vulnerabilities = await this.checkVulnerabilities(info.groupId, info.artifactId, info.version);

        return {
            jarName,
            ...info,
            vulnerabilities
        };
    }

    private async extractJarInfo(jarPath: string): Promise<{ groupId?: string, artifactId?: string, version?: string }> {
        // We use PowerShell to quickly peek inside the JAR for pom.properties
        // This is faster than extracting the whole JAR
        const normalizedPath = jarPath.split(path.sep).join("/");
        const psCommand = `
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip = [System.IO.Compression.ZipFile]::OpenRead("${normalizedPath}")
            $entry = $zip.Entries | Where-Object { $_.FullName -match "pom.properties$" } | Select-Object -First 1
            if ($entry) {
                $stream = $entry.Open()
                $reader = New-Object System.IO.StreamReader($stream)
                $content = $reader.ReadToEnd()
                $reader.Close()
                $stream.Close()
                $content
            }
            $zip.Dispose()
        `;

        try {
            const proc = Bun.spawn(["powershell", "-command", psCommand]);
            const output = await new Response(proc.stdout).text();
            
            const groupId = output.match(/groupId=(.*)/)?.[1]?.trim();
            const artifactId = output.match(/artifactId=(.*)/)?.[1]?.trim();
            const version = output.match(/version=(.*)/)?.[1]?.trim();

            return { groupId, artifactId, version };
        } catch (e) {
            return {};
        }
    }

    private async checkVulnerabilities(groupId?: string, artifactId?: string, version?: string): Promise<Vulnerability[]> {
        if (!artifactId || !version) return [];

        const name = groupId ? `${groupId}:${artifactId}` : artifactId;
        
        try {
            const response = await fetch("https://api.osv.dev/v1/query", {
                method: "POST",
                body: JSON.stringify({
                    version: version,
                    package: {
                        name: name,
                        ecosystem: "Maven"
                    }
                })
            });

            const data = await response.json();
            if (!data.vulns) return [];

            return data.vulns.map((v: any) => ({
                id: v.id,
                summary: v.summary || v.details?.substring(0, 100) + "...",
                details: v.details,
                severity: this.extractSeverity(v),
                fixedIn: v.affected?.[0]?.ranges?.[0]?.events?.find((e: any) => e.fixed)?.fixed
            }));
        } catch (e) {
            return [];
        }
    }

    private extractSeverity(vuln: any): string {
        if (vuln.database_specific?.severity) return vuln.database_specific.severity;
        if (vuln.advisories?.[0]?.url?.includes("github.com/advisories")) {
            // Try to infer from details if common keywords exist
            const d = (vuln.details || "").toLowerCase();
            if (d.includes("critical")) return "CRITICAL";
            if (d.includes("high")) return "HIGH";
            if (d.includes("moderate") || d.includes("medium")) return "MEDIUM";
        }
        return "UNKNOWN";
    }
}
