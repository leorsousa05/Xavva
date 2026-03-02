import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../utils/ui";
import path from "path";

export class RunCommand implements Command {
    async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
        const isDebug = args?.debug !== false; // Default to true if not specified, matching previous behavior
        let className = config.project.grep;
        
        if (!className) {
            className = await this.loadFromHistory();
            if (!className) {
                Logger.error(`Uso: xavva ${isDebug ? "debug" : "run"} NomeDaClasse`);
                return;
            }
        }

        if (!className.includes(".")) {
            const discoveredClass = await this.discoverClass(className);
            if (!discoveredClass) return;
            className = discoveredClass;
        }

        this.saveToHistory(className);

        if (isDebug) {
            Logger.section(`Interactive Debug: ${className}`);
        } else {
            Logger.section(`Running: ${className}`);
        }
        
        const { localCp, dependencyCp } = await this.getClasspath(config);
        const pathingJar = await this.createPathingJar(dependencyCp);
        
        const finalCp = `${localCp};${pathingJar}`;

        const javaArgs = [
            "-classpath", finalCp,
        ];

        if (isDebug) {
            javaArgs.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005");
        }

        javaArgs.push(className);

        if (isDebug) {
            Logger.warn(`🚀 Aguardando debugger na porta 5005 para ${className}...`);
            Logger.log(`${Logger.C.cyan}Dica:${Logger.C.reset} No VS Code ou IntelliJ, use 'Attach to Remote JVM' na porta 5005.`);
            Logger.newline();
        } else {
            Logger.warn(`🚀 Executando ${className}...`);
        }

        const bin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java.exe") : "java";
        
        const proc = Bun.spawn([bin, ...javaArgs], {
            stdout: "inherit",
            stderr: "inherit",
            stdin: "inherit",
            env: {
                ...process.env,
                JAVA_OPTS: "-Xms256m -Xmx1024m"
            } as any
        });

        await proc.exited;
        Logger.log(`Sessão de ${isDebug ? "debug" : "execução"} encerrada.`);
    }

    private async discoverClass(simpleName: string): Promise<string | null> {
        const fs = require("fs");
        const glob = require("glob");
        const basePaths = [
            path.join(process.cwd(), "src/main/java"),
            path.join(process.cwd(), "src/test/java"),
            path.join(process.cwd(), "src")
        ];
        
        const files: string[] = [];
        const seenFiles = new Set<string>();

        for (const srcPath of basePaths) {
            if (fs.existsSync(srcPath)) {
                const pattern = path.join(srcPath, "**", `${simpleName}.java`).replace(/\\/g, "/");
                const found = glob.sync(pattern);
                found.forEach((f: string) => {
                    const abs = path.resolve(f);
                    if (!seenFiles.has(abs)) {
                        files.push(abs);
                        seenFiles.add(abs);
                    }
                });
            }
        }

        if (files.length === 0) {
            for (const srcPath of basePaths) {
                if (fs.existsSync(srcPath)) {
                    const pattern = path.join(srcPath, "**", `*${simpleName}*.java`).replace(/\\/g, "/");
                    const found = glob.sync(pattern);
                    found.forEach((f: string) => {
                        const abs = path.resolve(f);
                        if (!seenFiles.has(abs)) {
                            files.push(abs);
                            seenFiles.add(abs);
                        }
                    });
                }
            }
            if (files.length === 0) {
                Logger.error(`Classe "${simpleName}" não encontrada nos diretórios de código (src/main/java, src/test/java, src).`);
                return null;
            }
        }

        const classes = files.map((file: string) => {
            const content = fs.readFileSync(file, "utf8");
            const packageMatch = content.match(/^package\s+([^;]+);/m);
            const packageName = packageMatch ? packageMatch[1] : "";
            const fileName = path.basename(file, ".java");
            return packageName ? `${packageName}.${fileName}` : fileName;
        });

        const uniqueClasses = Array.from(new Set(classes));

        if (uniqueClasses.length === 1) {
            return uniqueClasses[0];
        }

        Logger.warn(`Múltiplas classes encontradas para "${simpleName}":`);
        uniqueClasses.forEach((c, i) => {
            Logger.log(`  [${i + 1}] ${c}`);
        });

        const readline = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            readline.question(`  Escolha a classe (1-${uniqueClasses.length}) ou [C]ancelar: `, (answer: string) => {
                readline.close();
                const idx = parseInt(answer) - 1;
                if (!isNaN(idx) && uniqueClasses[idx]) {
                    resolve(uniqueClasses[idx]);
                } else {
                    Logger.error("Operação cancelada.");
                    resolve(null);
                }
            });
        });
    }

    private async loadFromHistory(): Promise<string | null> {
        const fs = require("fs");
        const xavvaDir = path.join(process.cwd(), ".xavva");
        const historyFile = path.join(xavvaDir, "history.json");

        if (!fs.existsSync(historyFile)) return null;

        try {
            const history: string[] = JSON.parse(fs.readFileSync(historyFile, "utf8"));
            if (history.length === 0) return null;

            Logger.warn(`Classes executadas recentemente:`);
            history.slice(0, 5).forEach((c, i) => {
                Logger.log(`  [${i + 1}] ${c}${i === 0 ? " (Enter)" : ""}`);
            });

            const readline = require("readline").createInterface({
                input: process.stdin,
                output: process.stdout
            });

            return new Promise((resolve) => {
                readline.question(`  Escolha a classe (1-${Math.min(history.length, 5)}) ou [C]ancelar: `, (answer: string) => {
                    readline.close();
                    if (!answer.trim()) {
                        resolve(history[0]);
                        return;
                    }
                    const idx = parseInt(answer) - 1;
                    if (!isNaN(idx) && history[idx]) {
                        resolve(history[idx]);
                    } else {
                        resolve(null);
                    }
                });
            });
        } catch (e) {
            return null;
        }
    }

    private saveToHistory(className: string) {
        const fs = require("fs");
        const xavvaDir = path.join(process.cwd(), ".xavva");
        const historyFile = path.join(xavvaDir, "history.json");

        if (!fs.existsSync(xavvaDir)) fs.mkdirSync(xavvaDir);

        let history: string[] = [];
        if (fs.existsSync(historyFile)) {
            try {
                history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
            } catch (e) {}
        }

        history = [className, ...history.filter(c => c !== className)].slice(0, 10);
        
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    }

    private async createPathingJar(dependencyCp: string): Promise<string> {
        const fs = require("fs");
        const xavvaDir = path.join(process.cwd(), ".xavva");
        const jarPath = path.join(xavvaDir, "classpath.jar");

        const paths = dependencyCp.split(";").filter(p => p.trim());
        const relativePaths = paths.map(p => {
            let rel = path.relative(xavvaDir, p).replace(/\\/g, "/");
            if (fs.existsSync(p) && fs.statSync(p).isDirectory() && !rel.endsWith("/")) rel += "/";
            // Robust URL encoding for Class-Path as per Java Spec
            return encodeURI(rel)
                .replace(/#/g, '%23')
                .replace(/\?/g, '%3F')
                .replace(/%5B/g, '[')
                .replace(/%5D/g, ']');
        }).join(" ");

        const header = "Class-Path: ";
        let manifestContent = "Manifest-Version: 1.0\r\n";
        
        let currentLine = header;
        const parts = relativePaths.split(" ");
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i] + (i < parts.length - 1 ? " " : "");
            
            // Se adicionar o próximo 'part' exceder 70 bytes (margem de segurança antes do CRLF)
            if (Buffer.from(currentLine + part).length > 70) {
                // Se a parte em si for muito longa, precisamos quebrá-la
                if (Buffer.from(" " + part).length > 70) {
                    let remainingPart = part;
                    while (remainingPart.length > 0) {
                        const spaceLeft = 70 - Buffer.from(currentLine).length;
                        
                        // Encontra quantos caracteres de 'remainingPart' cabem no espaço restante
                        let fitCount = 0;
                        let fitBytes = 0;
                        for (let j = 0; j < remainingPart.length; j++) {
                            const charBytes = Buffer.from(remainingPart[j]).length;
                            if (fitBytes + charBytes > spaceLeft) break;
                            fitBytes += charBytes;
                            fitCount++;
                        }

                        if (fitCount > 0) {
                            currentLine += remainingPart.substring(0, fitCount);
                            remainingPart = remainingPart.substring(fitCount);
                        }

                        if (remainingPart.length > 0) {
                            manifestContent += currentLine + "\r\n";
                            currentLine = " ";
                        }
                    }
                } else {
                    manifestContent += currentLine + "\r\n";
                    currentLine = " " + part;
                }
            } else {
                currentLine += part;
            }
        }
        manifestContent += currentLine + "\r\n\r\n";

        const manifestPath = path.join(xavvaDir, "MANIFEST.MF");
        fs.writeFileSync(manifestPath, manifestContent);

        Bun.spawnSync(["jar", "cfm", jarPath, manifestPath]);
        return jarPath;
    }

    private async getClasspath(config: AppConfig): Promise<{ localCp: string, dependencyCp: string }> {
        const fs = require("fs");
        const xavvaDir = path.join(process.cwd(), ".xavva");
        const cpFile = path.join(xavvaDir, "classpath.txt");

        if (!fs.existsSync(xavvaDir)) fs.mkdirSync(xavvaDir);

        if (!fs.existsSync(cpFile)) {
            const stopSpinner = Logger.spinner("Generating project classpath");
            try {
                if (config.project.buildTool === "maven") {
                    Bun.spawnSync(["mvn", "dependency:build-classpath", `-Dmdep.outputFile=${cpFile}`]);
                } else if (config.project.buildTool === "gradle") {
                    const initScriptPath = path.join(xavvaDir, "init-cp.gradle");
                    const normalizedCpFile = cpFile.replace(/\\/g, "/");
                    const initScriptContent = `
                        allprojects {
                            afterEvaluate { project ->
                                if (project.plugins.hasPlugin('java')) {
                                    tasks.register('printClasspath') {
                                        doLast {
                                            def cp = project.sourceSets.main.runtimeClasspath.asPath
                                            def file = new File("${normalizedCpFile}")
                                            if (!file.exists()) {
                                                file.text = cp
                                            } else {
                                                file.text = file.text + File.pathSeparator + cp
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    `.trim().replace(/^ {24}/gm, ""); // Remove excess indentation
                    fs.writeFileSync(initScriptPath, initScriptContent);
                    Bun.spawnSync(["gradle", "-q", "printClasspath", "-I", initScriptPath]);
                    if (fs.existsSync(initScriptPath)) fs.unlinkSync(initScriptPath);
                } else {
                    fs.writeFileSync(cpFile, "."); 
                }
            } catch (e) {
                Logger.error(`Falha ao gerar classpath: ${e}`);
            }
            stopSpinner();
        }

        let dependencyCp = fs.existsSync(cpFile) ? fs.readFileSync(cpFile, "utf8").trim() : "";
        
        // Normalize platform specific separators to semicolon for consistency
        if (path.delimiter !== ";") {
            dependencyCp = dependencyCp.split(path.delimiter).join(";");
        }

        const localFolders = [
            "target/classes",
            "target/test-classes",
            "build/classes/java/main",
            "build/classes/java/test",
            "build/classes/kotlin/main",
            "build/resources/main",
            "build/resources/test",
            "bin/main",
            "bin/test",
            "."
        ];
        
        const localCp = localFolders
            .map(p => path.join(process.cwd(), p))
            .filter(p => fs.existsSync(p))
            .join(";");

        return { localCp, dependencyCp };
    }
}
