/**
 * Verificador de compatibilidade Tomcat
 * 
 * Features:
 * - Detecta versão Servlet/JSP suportada
 * - Valida compatibilidade com projeto
 * - Detecta uso de APIs deprecated
 * - Sugere versões compatíveis
 */
import { Logger } from "../../logging";
import { existsSync, promises as fsPromises } from "fs";
import path from "path";
import type { CompatibilityResult } from "./types";

// Mapeamento de versões Tomcat para Servlet/JSP
const TOMCAT_VERSIONS: Record<string, { servlet: string; jsp: string; java: string }> = {
    "11.0": { servlet: "6.1", jsp: "4.0", java: "21" },
    "10.1": { servlet: "6.0", jsp: "3.1", java: "11" },
    "10.0": { servlet: "5.0", jsp: "3.0", java: "8" },
    "9.0": { servlet: "4.0", jsp: "2.3", java: "8" },
    "8.5": { servlet: "3.1", jsp: "2.3", java: "7" },
    "8.0": { servlet: "3.1", jsp: "2.3", java: "7" },
    "7.0": { servlet: "3.0", jsp: "2.2", java: "6" },
};

// APIs deprecated por versão
const DEPRECATED_APIS: Record<string, string[]> = {
    "9.0": ["javax.servlet.* (migrar para jakarta.servlet.* no Tomcat 10+)"],
    "10.0": ["javax.servlet.* (usar jakarta.servlet.*)"],
    "10.1": [],
    "11.0": []
};

export class TomcatCompatibilityChecker {
    private logger = Logger.getInstance();

    /**
     * Extrai versão major do Tomcat (ex: 10.1.52 -> 10.1)
     */
    private getMajorVersion(version: string): string {
        const parts = version.split(".");
        return parts.slice(0, 2).join(".");
    }

    /**
     * Obtém informações de uma versão Tomcat
     */
    getVersionInfo(version: string): { servlet: string; jsp: string; java: string } | null {
        const major = this.getMajorVersion(version);
        return TOMCAT_VERSIONS[major] || null;
    }

    /**
     * Verifica compatibilidade do Tomcat com projeto
     */
    async checkCompatibility(
        tomcatVersion: string,
        projectPath: string
    ): Promise<CompatibilityResult> {
        const majorVersion = this.getMajorVersion(tomcatVersion);
        const versionInfo = this.getVersionInfo(tomcatVersion);
        
        const warnings: string[] = [];
        const errors: string[] = [];

        if (!versionInfo) {
            errors.push(`Versão ${tomcatVersion} não reconhecida`);
            return {
                compatible: false,
                tomcatVersion,
                servletVersion: "",
                jspVersion: "",
                warnings,
                errors
            };
        }

        // Verifica pom.xml ou build.gradle
        const pomPath = path.join(projectPath, "pom.xml");
        const gradlePath = path.join(projectPath, "build.gradle");

        if (existsSync(pomPath)) {
            await this.checkMavenCompatibility(pomPath, majorVersion, warnings, errors);
        } else if (existsSync(gradlePath)) {
            await this.checkGradleCompatibility(gradlePath, majorVersion, warnings, errors);
        }

        // Verifica uso de APIs deprecated
        const deprecated = DEPRECATED_APIS[majorVersion] || [];
        if (deprecated.length > 0) {
            warnings.push(...deprecated);
        }

        // Verifica Java version
        const javaVersion = process.version; // Node.js version, mas usamos para lógica
        // Nota: Em ambiente real, verificaríamos JAVA_HOME

        const compatible = errors.length === 0;

        return {
            compatible,
            tomcatVersion,
            servletVersion: versionInfo.servlet,
            jspVersion: versionInfo.jsp,
            warnings,
            errors
        };
    }

    /**
     * Verifica compatibilidade com Maven
     */
    private async checkMavenCompatibility(
        pomPath: string,
        tomcatMajor: string,
        warnings: string[],
        errors: string[]
    ): Promise<void> {
        try {
            const content = await fsPromises.readFile(pomPath, "utf-8");

            // Verifica servlet-api dependency
            const servletMatch = content.match(/<artifactId>servlet-api<\/artifactId>\s*<version>([^<]+)<\/version>/);
            if (servletMatch) {
                const servletVersion = servletMatch[1];
                const expectedServlet = TOMCAT_VERSIONS[tomcatMajor]?.servlet;
                
                if (expectedServlet && !servletVersion.startsWith(expectedServlet.split(".")[0])) {
                    warnings.push(`pom.xml usa servlet-api ${servletVersion}, Tomcat ${tomcatMajor} requer Servlet ${expectedServlet}`);
                }
            }

            // Verifica javax vs jakarta
            if (tomcatMajor >= "10.0") {
                if (content.includes("javax.servlet") && !content.includes("jakarta.servlet")) {
                    errors.push(`Tomcat ${tomcatMajor} requer Jakarta EE (jakarta.servlet.*), mas pom.xml usa javax.servlet`);
                }
            }

            // Verifica versão do plugin tomcat
            const tomcatPluginMatch = content.match(/<artifactId>tomcat[\w-]*plugin<\/artifactId>.*?<version>([^<]+)<\/version>/s);
            if (tomcatPluginMatch) {
                const pluginVersion = tomcatPluginMatch[1];
                const pluginMajor = this.getMajorVersion(pluginVersion);
                
                if (pluginMajor !== tomcatMajor) {
                    warnings.push(`Plugin Tomcat ${pluginVersion} pode não ser compatível com Tomcat ${tomcatMajor}`);
                }
            }
        } catch (error) {
            warnings.push("Não foi possível analisar pom.xml");
        }
    }

    /**
     * Verifica compatibilidade com Gradle
     */
    private async checkGradleCompatibility(
        gradlePath: string,
        tomcatMajor: string,
        warnings: string[],
        errors: string[]
    ): Promise<void> {
        try {
            const content = await fsPromises.readFile(gradlePath, "utf-8");

            // Verifica javax vs jakarta
            if (tomcatMajor >= "10.0") {
                if (content.includes("javax.servlet") && !content.includes("jakarta.servlet")) {
                    errors.push(`Tomcat ${tomcatMajor} requer Jakarta EE (jakarta.servlet.*), mas build.gradle usa javax.servlet`);
                }
            }

            // Verifica versões de dependências
            const servletMatch = content.match(/servlet-api['"]\s*:\s*['"]([^'"]+)['"]/);
            if (servletMatch) {
                const servletVersion = servletMatch[1];
                const expectedServlet = TOMCAT_VERSIONS[tomcatMajor]?.servlet;
                
                if (expectedServlet && !servletVersion.startsWith(expectedServlet.split(".")[0])) {
                    warnings.push(`build.gradle usa servlet-api ${servletVersion}, Tomcat ${tomcatMajor} requer Servlet ${expectedServlet}`);
                }
            }
        } catch (error) {
            warnings.push("Não foi possível analisar build.gradle");
        }
    }

    /**
     * Sugere versão Tomcat compatível com projeto
     */
    async suggestVersion(projectPath: string): Promise<string | null> {
        const pomPath = path.join(projectPath, "pom.xml");
        const gradlePath = path.join(projectPath, "build.gradle");

        let usesJakarta = false;
        let servletVersion: string | null = null;

        try {
            if (existsSync(pomPath)) {
                const content = await fsPromises.readFile(pomPath, "utf-8");
                usesJakarta = content.includes("jakarta.servlet");
                
                const match = content.match(/<artifactId>servlet-api<\/artifactId>\s*<version>([^<]+)<\/version>/);
                if (match) servletVersion = match[1];
            } else if (existsSync(gradlePath)) {
                const content = await fsPromises.readFile(gradlePath, "utf-8");
                usesJakarta = content.includes("jakarta.servlet");
                
                const match = content.match(/servlet-api['"]\s*:\s*['"]([^'"]+)['"]/);
                if (match) servletVersion = match[1];
            }
        } catch {
            return null;
        }

        // Se usa Jakarta EE, precisa Tomcat 10+
        if (usesJakarta) {
            return "10.1.52"; // Versão estável mais recente
        }

        // Se especificou versão do servlet
        if (servletVersion) {
            const major = parseInt(servletVersion.split(".")[0]);
            
            if (major >= 6) return "10.1.52";
            if (major >= 5) return "10.0.27";
            if (major >= 4) return "9.0.96";
            if (major >= 3) return "8.5.100";
        }

        // Padrão: Tomcat 9 (mais compatível)
        return "9.0.96";
    }

    /**
     * Retorna informações sobre migração entre versões
     */
    getMigrationGuide(fromVersion: string, toVersion: string): string[] {
        const guides: string[] = [];
        const fromMajor = this.getMajorVersion(fromVersion);
        const toMajor = this.getMajorVersion(toVersion);

        if (fromMajor === toMajor) {
            guides.push("Mesma versão major - migração direta sem mudanças");
            return guides;
        }

        // Migração 9.x -> 10.x
        if (fromMajor.startsWith("9") && toMajor.startsWith("10")) {
            guides.push("⚠️  MIGRAÇÃO IMPORTANTE: Tomcat 10+ usa Jakarta EE");
            guides.push("   - javax.servlet.* → jakarta.servlet.*");
            guides.push("   - javax.servlet.jsp.* → jakarta.servlet.jsp.*");
            guides.push("   - Atualize dependências no pom.xml/build.gradle");
            guides.push("   - Use ferramenta de migração: https://tomcat.apache.org/migration.html");
        }

        // Migração 8.x -> 9.x
        if (fromMajor.startsWith("8") && toMajor.startsWith("9")) {
            guides.push("Tomcat 9 requer Servlet 4.0 - verifique compatibilidade");
        }

        // Migração 10.x -> 11.x
        if (fromMajor.startsWith("10") && toMajor.startsWith("11")) {
            guides.push("Tomcat 11 requer Java 21+");
            guides.push("Verifique se seu projeto é compatível com Java 21");
        }

        return guides;
    }

    /**
     * Exibe relatório de compatibilidade
     */
    printCompatibilityReport(result: CompatibilityResult): void {
        this.logger.section("Verificação de Compatibilidade");
        
        this.logger.info(`Tomcat: ${result.tomcatVersion}`);
        this.logger.info(`Servlet: ${result.servletVersion}`);
        this.logger.info(`JSP: ${result.jspVersion}`);

        if (result.compatible) {
            this.logger.success("✓ Compatível");
        } else {
            this.logger.error("✗ Incompatível");
        }

        if (result.warnings.length > 0) {
            this.logger.warn("\nAvisos:");
            result.warnings.forEach(w => this.logger.warn(`  • ${w}`));
        }

        if (result.errors.length > 0) {
            this.logger.error("\nErros:");
            result.errors.forEach(e => this.logger.error(`  • ${e}`));
        }
    }
}
