import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import path from "path";
import type { ProjectConfig } from "../types/config";

export class ProjectService {
    constructor(private config: ProjectConfig) {}

    getBuildOutputDir(): string {
        return path.join(process.cwd(), this.config.buildTool === "maven" ? "target" : "build");
    }

    getClassesDir(): string {
        return this.config.buildTool === "maven" 
            ? path.join(process.cwd(), "target", "classes")
            : path.join(process.cwd(), "build", "classes", "java", "main");
    }

    getSourceDirs(): string[] {
        return [
            path.join(process.cwd(), "src", "main", "java"),
            path.join(process.cwd(), "src", "main", "resources"),
            path.join(process.cwd(), "src", "main", "webapp")
        ].filter(d => existsSync(d));
    }

    getArtifact(): { path: string; name: string; isDirectory: boolean } {
        const buildDir = this.getBuildOutputDir();
        const artifacts = this.searchArtifacts(buildDir).sort((a, b) => b.time - a.time);

        if (artifacts.length === 0) {
            // Debug: listar o que existe no diretório target
            let debugInfo = `\nDiretório ${buildDir} existe: ${existsSync(buildDir)}`;
            if (existsSync(buildDir)) {
                debugInfo += `\nConteúdo: ${readdirSync(buildDir).join(', ')}`;
            }
            throw new Error(`Nenhum artefato (.war ou pasta exploded) encontrado em ${buildDir}!${debugInfo}`);
        }

        const artifact = artifacts[0];
        return {
            path: artifact.path,
            name: this.config.appName ? `${this.config.appName}.war` : artifact.name,
            isDirectory: artifact.isDirectory
        };
    }

    private searchArtifacts(dir: string): { path: string; name: string; time: number; isDirectory: boolean }[] {
        let results: { path: string; name: string; time: number; isDirectory: boolean }[] = [];
        if (!existsSync(dir)) return results;

        const list = readdirSync(dir, { withFileTypes: true });
        for (const item of list) {
            const fullPath = path.resolve(dir, item.name);
            
            if (item.isDirectory()) {
                // Se for Maven e tiver WEB-INF, é um exploded war
                if (this.config.buildTool === 'maven' && existsSync(path.join(fullPath, "WEB-INF"))) {
                    results.push({ 
                        path: fullPath, 
                        name: `${item.name}.war`, 
                        time: statSync(fullPath).mtime.getTime(),
                        isDirectory: true 
                    });
                } else if (item.name.endsWith('.war')) { // Algumas ferramentas podem gerar pastas .war
                     results.push({ 
                        path: fullPath, 
                        name: item.name, 
                        time: statSync(fullPath).mtime.getTime(),
                        isDirectory: true 
                    });
                } else if (['libs', 'distributions'].includes(item.name)) { // Gradle common dirs
                    results = results.concat(this.searchArtifacts(fullPath));
                }
            } else if (item.name.endsWith('.war')) {
                results.push({ 
                    path: fullPath, 
                    name: item.name, 
                    time: statSync(fullPath).mtime.getTime(),
                    isDirectory: false 
                });
            }
        }
        return results;
    }

    getInferredAppName(): string {
        if (this.config.appName) return this.config.appName;
        try {
            const artifact = this.getArtifact();
            return artifact.name.replace(".war", "");
        } catch (e) {
            return "ROOT";
        }
    }

    getAvailableProfiles(): string[] {
        const results: string[] = [];
        const root = process.cwd();

        if (this.config.buildTool === 'maven') {
            const pomPath = path.join(root, "pom.xml");
            if (existsSync(pomPath)) {
                try {
                    const content = readFileSync(pomPath, "utf8");
                    // Regex simples para capturar IDs de profiles no pom.xml
                    const profileRegex = /<profile>[\s\S]*?<id>(.*?)<\/id>/g;
                    let match;
                    while ((match = profileRegex.exec(content)) !== null) {
                        results.push(match[1]);
                    }
                } catch (e) {}
            }
        } else if (this.config.buildTool === 'gradle') {
            const gradlePath = path.join(root, "build.gradle");
            const gradleKtsPath = path.join(root, "build.gradle.kts");
            const targetPath = existsSync(gradlePath) ? gradlePath : existsSync(gradleKtsPath) ? gradleKtsPath : null;

            if (targetPath) {
                try {
                    const content = readFileSync(targetPath, "utf8");
                    // Em Gradle, perfis costumam ser tratados via propriedades ou tasks de ambiente
                    // Vamos procurar por padrões comuns como "if (project.hasProperty('profile'))" 
                    // ou simplesmente sugerir o uso de -P
                    if (content.includes("project.hasProperty('profile')") || content.includes("-Pprofile")) {
                        results.push("(Detectado uso dinâmico de -Pprofile)");
                    }
                } catch (e) {}
            }
        }

        return results;
    }

    findAllClassPaths(): string[] {
        const results: string[] = [];
        const root = process.cwd();

        const scan = (dir: string) => {
            try {
                const files = readdirSync(dir, { withFileTypes: true });
                for (const file of files) {
                    if (!file.isDirectory()) continue;
                    
                    const name = file.name;
                    if (name.startsWith('.') || ['node_modules', 'out', 'bin', 'src', 'webapps', '.xavva'].includes(name)) continue;

                    const fullPath = path.join(dir, name);
                    
                    const isMavenClasses = this.config.buildTool === 'maven' && name === 'classes' && dir.endsWith('target');
                    const isGradleClasses = this.config.buildTool === 'gradle' && name === 'main' && dir.endsWith(path.join('classes', 'java'));
                    
                    if (isMavenClasses || isGradleClasses) {
                        results.push(fullPath.replace(/\\/g, "/"));
                    } else {
                        scan(fullPath);
                    }
                }
            } catch (e) {}
        };

        scan(root);
        
        if (results.length === 0) {
            results.push(this.getClassesDir().replace(/\\/g, "/"));
        }

        return results;
    }
}
