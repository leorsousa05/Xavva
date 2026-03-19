/**
 * Utilitários para manipulação de paths
 * Centraliza lógica comum de normalização e resolução de caminhos
 */

import path from "path";

export class PathUtils {
    /**
     * Normaliza separadores de path para forward slash
     */
    static normalizeSeparators(filePath: string): string {
        return filePath.replace(/\\/g, "/");
    }

    /**
     * Converte caminho relativo para absoluto a partir do cwd
     */
    static resolveFromCwd(relativePath: string): string {
        return path.resolve(process.cwd(), relativePath);
    }

    /**
     * Obtém caminho relativo a partir do diretório raiz do projeto
     */
    static relativeToProject(absolutePath: string): string {
        return path.relative(process.cwd(), absolutePath);
    }

    /**
     * Verifica se caminho está dentro do diretório src/main/java (Maven) ou equivalente
     */
    static isSourceFile(filePath: string): boolean {
        const normalized = this.normalizeSeparators(filePath);
        return /src\/(main|test)\/(java|resources)/.test(normalized);
    }

    /**
     * Extrai package de um arquivo Java baseado no caminho
     */
    static extractPackageFromPath(javaFilePath: string): string | null {
        const normalized = this.normalizeSeparators(javaFilePath);
        
        // Procura por src/main/java ou src/test/java
        const match = normalized.match(/src\/(?:main|test)\/java\/(.*)\/[^/]+\.java$/);
        if (match) {
            return match[1].replace(/\//g, ".");
        }
        
        return null;
    }

    /**
     * Converte caminho de .java para .class
     */
    static javaToClassPath(javaPath: string): string {
        return javaPath.replace(/\.java$/i, ".class");
    }

    /**
     * Converte caminho relativo do source para caminho no diretório de classes
     */
    static sourceToClassesPath(
        sourcePath: string, 
        classesDir: string,
        sourceRoots: string[] = ["src/main/java", "src/test/java", "src"]
    ): string {
        const normalized = this.normalizeSeparators(sourcePath);
        
        for (const root of sourceRoots) {
            const normalizedRoot = this.normalizeSeparators(root);
            const index = normalized.indexOf(normalizedRoot);
            if (index !== -1) {
                const relativePart = normalized.slice(index + normalizedRoot.length + 1);
                const classFile = this.javaToClassPath(relativePart);
                return path.join(classesDir, classFile);
            }
        }
        
        // Fallback: assume que é relativo ao classesDir
        return path.join(classesDir, path.basename(this.javaToClassPath(sourcePath)));
    }

    /**
     * Encontra o webapp root a partir de um caminho de recurso
     */
    static findWebappRoot(resourcePath: string): string | null {
        const normalized = this.normalizeSeparators(resourcePath);
        const parts = normalized.split("/");
        
        const webappIndex = parts.indexOf("webapp");
        const webContentIndex = parts.indexOf("WebContent");
        const rootIndex = webappIndex !== -1 ? webappIndex : webContentIndex;
        
        if (rootIndex !== -1) {
            return parts.slice(0, rootIndex + 1).join("/");
        }
        
        return null;
    }

    /**
     * Obtém caminho relativo dentro do webapp
     */
    static getWebappRelativePath(resourcePath: string): string | null {
        const normalized = this.normalizeSeparators(resourcePath);
        const parts = normalized.split("/");
        
        const webappIndex = parts.indexOf("webapp");
        const webContentIndex = parts.indexOf("WebContent");
        const rootIndex = webappIndex !== -1 ? webappIndex : webContentIndex;
        
        if (rootIndex !== -1 && rootIndex < parts.length - 1) {
            return parts.slice(rootIndex + 1).join("/");
        }
        
        return null;
    }

    /**
     * Verifica se é arquivo de recurso web (JSP, HTML, etc)
     */
    static isWebResource(filePath: string): boolean {
        return /\.(jsp|html|htm|css|js|xml|properties|json|png|jpg|jpeg|gif|svg|ico)$/i.test(filePath);
    }

    /**
     * Verifica se é arquivo Java
     */
    static isJavaFile(filePath: string): boolean {
        return /\.java$/i.test(filePath);
    }

    /**
     * Verifica se é arquivo de build/configuração
     */
    static isBuildConfig(filePath: string): boolean {
        return /(pom\.xml|build\.gradle|build\.gradle\.kts|settings\.gradle)$/i.test(filePath);
    }

    /**
     * Combina múltiplos paths de forma segura
     */
    static combinePaths(...parts: string[]): string {
        return path.join(...parts);
    }

    /**
     * Obtém diretório do arquivo
     */
    static getDir(filePath: string): string {
        return path.dirname(filePath);
    }

    /**
     * Obtém nome do arquivo
     */
    static getFilename(filePath: string): string {
        return path.basename(filePath);
    }

    /**
     * Obtém extensão do arquivo
     */
    static getExtension(filePath: string): string {
        return path.extname(filePath).toLowerCase();
    }

    /**
     * Remove extensão do arquivo
     */
    static removeExtension(filePath: string): string {
        const ext = path.extname(filePath);
        return ext ? filePath.slice(0, -ext.length) : filePath;
    }

    /**
     * Verifica se caminho está dentro de diretório ignorado
     */
    static isIgnoredPath(filePath: string, ignoredDirs: string[] = []): boolean {
        const normalized = this.normalizeSeparators(filePath);
        const defaultIgnored = ["target", "build", "node_modules", ".git", ".xavva"];
        const allIgnored = [...defaultIgnored, ...ignoredDirs];
        
        return allIgnored.some(dir => {
            // Match exato ou como diretório
            const pattern = new RegExp(`(^|/)${dir}($|/)`);
            return pattern.test(normalized);
        });
    }

    /**
     * Resolve caminho de contexto WAR
     */
    static resolveContextPath(appName: string): string {
        return appName.replace(/\.war$/i, "");
    }
}

// Exporta funções standalone para conveniência
export const {
    normalizeSeparators,
    resolveFromCwd,
    relativeToProject,
    isSourceFile,
    extractPackageFromPath,
    javaToClassPath,
    sourceToClassesPath,
    findWebappRoot,
    getWebappRelativePath,
    isWebResource,
    isJavaFile,
    isBuildConfig,
    combinePaths,
    getDir,
    getFilename,
    getExtension,
    removeExtension,
    isIgnoredPath,
    resolveContextPath,
} = PathUtils;
