/**
 * Platform Utilities - Helpers para detecção e adaptação multiplataforma
 * 
 * Centraliza toda a lógica de diferenciação entre Windows, Linux e macOS.
 */

import os from "os";
import path from "path";

export type Platform = "win32" | "linux" | "darwin";

/**
 * Retorna a plataforma atual normalizada
 */
export function getPlatform(): Platform {
    const platform = process.platform;
    if (platform === "win32") return "win32";
    if (platform === "darwin") return "darwin";
    return "linux";
}

/**
 * Verifica se está rodando no Windows
 */
export function isWindows(): boolean {
    return getPlatform() === "win32";
}

/**
 * Verifica se está rodando no Linux
 */
export function isLinux(): boolean {
    return getPlatform() === "linux";
}

/**
 * Verifica se está rodando no macOS
 */
export function isMacOS(): boolean {
    return getPlatform() === "darwin";
}

/**
 * Retorna a extensão de script apropriada (.bat para Windows, .sh para Unix)
 */
export function getScriptExt(): string {
    return isWindows() ? ".bat" : ".sh";
}

/**
 * Retorna o nome do binário Java apropriado (java.exe para Windows, java para Unix)
 */
export function getJavaBinary(): string {
    return isWindows() ? "java.exe" : "java";
}

/**
 * Retorna o caminho completo para o binário Java se JAVA_HOME estiver definido
 */
export function getJavaPath(): string {
    if (process.env.JAVA_HOME) {
        const javaBin = path.join(process.env.JAVA_HOME, "bin", getJavaBinary());
        return javaBin;
    }
    return getJavaBinary();
}

/**
 * Retorna o script catalina apropriado (catalina.bat ou catalina.sh)
 */
export function getCatalinaScript(): string {
    return `catalina${getScriptExt()}`;
}

/**
 * Retorna o script startup apropriado
 */
export function getStartupScript(): string {
    return `startup${getScriptExt()}`;
}

/**
 * Retorna o script shutdown apropriado
 */
export function getShutdownScript(): string {
    return `shutdown${getScriptExt()}`;
}

/**
 * Retorna o comando Maven apropriado
 */
export function getMavenCommand(): string {
    return isWindows() ? "mvn.cmd" : "mvn";
}

/**
 * Retorna o comando Gradle apropriado
 */
export function getGradleCommand(): string {
    return isWindows() ? "gradle.bat" : "gradle";
}

/**
 * Retorna a extensão de arquivo de download do Tomcat (.zip para Windows, .tar.gz para Unix)
 */
export function getTomcatArchiveExt(): string {
    return isWindows() ? ".zip" : ".tar.gz";
}

/**
 * Retorna o nome do arquivo do Tomcat para download
 */
export function getTomcatArchiveName(version: string): string {
    const baseName = `apache-tomcat-${version}`;
    if (isWindows()) {
        return `${baseName}-windows-x64.zip`;
    }
    if (isMacOS()) {
        // macOS usa a mesma versão do Linux (tar.gz)
        return `${baseName}.tar.gz`;
    }
    return `${baseName}.tar.gz`;
}

/**
 * Retorna a URL de download do Tomcat baseada na versão e plataforma
 */
export function getTomcatDownloadUrl(version: string): string {
    const majorVersion = version.split(".")[0];
    const archiveName = getTomcatArchiveName(version);
    
    // URL primária (CDN Apache)
    return `https://dlcdn.apache.org/tomcat/tomcat-${majorVersion}/v${version}/bin/${archiveName}`;
}

/**
 * Retorna a URL alternativa (archive) caso a primária falhe
 */
export function getTomcatArchiveUrl(version: string): string {
    const majorVersion = version.split(".")[0];
    const archiveName = getTomcatArchiveName(version);
    
    // URL alternativa (archive Apache)
    return `https://archive.apache.org/dist/tomcat/tomcat-${majorVersion}/v${version}/bin/${archiveName}`;
}

/**
 * Retorna o comando para extrair um arquivo
 * Retorna null se não for possível determinar
 */
export function getExtractCommand(archivePath: string, destDir: string): string[] | null {
    if (isWindows()) {
        // Windows: usa PowerShell para extrair
        if (archivePath.endsWith(".zip")) {
            return [
                "powershell",
                "-command",
                `Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force`,
            ];
        }
        // Para .tar.gz no Windows (PowerShell 5.1+)
        if (archivePath.endsWith(".tar.gz") || archivePath.endsWith(".tgz")) {
            return [
                "powershell",
                "-command",
                `tar -xzf '${archivePath}' -C '${destDir}'`,
            ];
        }
    } else {
        // Linux/Mac: usa tar
        if (archivePath.endsWith(".tar.gz") || archivePath.endsWith(".tgz")) {
            return ["tar", "-xzf", archivePath, "-C", destDir];
        }
        // Para .zip no Linux/Mac
        if (archivePath.endsWith(".zip")) {
            // Tenta unzip primeiro, depois tar
            return ["unzip", "-q", "-o", archivePath, "-d", destDir];
        }
    }
    return null;
}

/**
 * Retorna o comando para verificar se uma porta está em uso
 */
export function getPortCheckCommand(port: number): string[] {
    if (isWindows()) {
        return ["cmd", "/c", `netstat -ano | findstr :${port}`];
    }
    // Linux/Mac: tenta lsof, ss, ou netstat
    // Preferência por lsof (mais comum)
    return ["sh", "-c", `lsof -i :${port} 2>/dev/null || ss -tlnp 2>/dev/null | grep ':${port}' || netstat -tlnp 2>/dev/null | grep ':${port}'`];
}

/**
 * Retorna o comando para matar um processo pelo PID
 */
export function getKillCommand(pid: number | string): string[] {
    if (isWindows()) {
        return ["taskkill", "/F", "/PID", String(pid)];
    }
    return ["kill", "-9", String(pid)];
}

/**
 * Retorna o comando para obter uso de memória de um processo
 */
export function getMemoryCommand(pid: number): string[] | null {
    if (isWindows()) {
        return [
            "powershell",
            "-command",
            `(Get-Process -Id ${pid}).WorkingSet64 / 1MB`,
        ];
    }
    // Linux: /proc/<pid>/status tem VmRSS em kB
    if (isLinux()) {
        return ["sh", "-c", `cat /proc/${pid}/status 2>/dev/null | grep VmRSS | awk '{print int($2/1024)}'`];
    }
    // macOS: usa ps
    if (isMacOS()) {
        return ["ps", "-o", "rss=", "-p", String(pid)];
    }
    return null;
}

/**
 * Retorna o comando para abrir uma URL no navegador padrão
 */
export function getOpenBrowserCommand(): string {
    if (isWindows()) {
        return "start";
    }
    if (isMacOS()) {
        return "open";
    }
    return "xdg-open";
}

/**
 * Retorna o comando para abrir uma URL no navegador (array para spawn)
 */
export function getOpenBrowserArgs(url: string): string[] {
    const cmd = getOpenBrowserCommand();
    if (isWindows()) {
        // Windows: start "" "url" (o "" é necessário para títulos de janela)
        return [cmd, "", url];
    }
    return [cmd, url];
}

/**
 * Retorna o comando para encontrar um binário no PATH
 */
export function getWhichCommand(binary: string): string[] {
    if (isWindows()) {
        return ["where", binary];
    }
    return ["which", binary];
}

/**
 * Retorna o separador de classpath apropriado
 */
export function getClasspathSeparator(): string {
    return path.delimiter;
}

/**
 * Normaliza um caminho para uso em classpath (converte backslash para forward slash)
 */
export function normalizeClasspathPath(p: string): string {
    return p.replace(/\\/g, "/");
}

/**
 * Retorna o comando para extrair um WAR/JAR (usando jar ou unzip)
 */
export function getWarExtractCommand(warPath: string, destDir: string): string[] {
    // Tenta usar jar (disponível em qualquer JDK)
    return ["jar", "xf", warPath];
}

/**
 * Retorna a URL de download do JetBrains Runtime (JBR) com DCEVM
 */
export function getJbrDownloadUrl(version: string = "21"): string {
    // JBR 21 é a versão recomendada
    if (isWindows()) {
        return `https://cache-redirector.jetbrains.com/intellij-jbr/jbrsdk-${version}.0.6-windows-x64-b895.97.tar.gz`;
    }
    if (isMacOS()) {
        return `https://cache-redirector.jetbrains.com/intellij-jbr/jbrsdk-${version}.0.6-osx-x64-b895.97.tar.gz`;
    }
    // Linux x64
    return `https://cache-redirector.jetbrains.com/intellij-jbr/jbrsdk-${version}.0.6-linux-x64-b895.97.tar.gz`;
}

/**
 * Retorna o comando para extrair um .tar.gz
 */
export function getTarExtractCommand(tarPath: string, destDir: string): string[] {
    if (isWindows()) {
        // Windows 10+ tem tar nativo via PowerShell
        return ["powershell", "-command", `tar -xzf '${tarPath}' -C '${destDir}'`];
    }
    return ["tar", "-xzf", tarPath, "-C", destDir];
}

/**
 * Constrói o caminho completo para o script catalina
 */
export function getCatalinaPath(tomcatHome: string): string {
    return path.join(tomcatHome, "bin", getCatalinaScript());
}

/**
 * Verifica se o script catalina existe no diretório do Tomcat
 */
export function hasCatalinaScript(tomcatHome: string): boolean {
    const { existsSync } = require("fs");
    return existsSync(getCatalinaPath(tomcatHome));
}
