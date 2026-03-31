import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../logging";
import path from "path";
import fs from "fs";
import { glob } from "glob";
import readline from "readline";
import { BuildService } from "../services/BuildService";
import {
    getJavaPath,
    getMavenCommand,
    getGradleCommand,
    getClasspathSeparator,
    normalizeClasspathPath,
    isWindows,
} from "../utils/platform";

export class RunCommand implements Command {
    private logger = Logger.getInstance();

    constructor(private buildService?: BuildService) {}

    async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
        const isDebug = args?.debug !== false; // Default to true if not specified, matching previous behavior
        let className = config.project.grep;
        
        if (!className) {
            className = await this.loadFromHistory();
            if (!className) {
                this.logger.error(`Uso: xavva ${isDebug ? "debug" : "run"} NomeDaClasse`);
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
            this.logger.section(`Interactive Debug: ${className}`);
        } else {
            this.logger.section(`Running: ${className}`);
        }
        
        // Verifica se as classes estão compiladas, se não, compila
        await this.ensureCompiled(config);
        
        const { localCp, dependencyCp } = await this.getClasspath(config);
        const pathingJar = await this.createPathingJar(dependencyCp);
        
        const sep = getClasspathSeparator();
        const finalCp = `${localCp}${sep}${pathingJar}`;

        const javaArgs = [
            "-classpath", finalCp,
        ];

        if (config.project.encoding) {
            javaArgs.push(`-Dfile.encoding=${config.project.encoding}`);
        }

        if (isDebug) {
            javaArgs.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005");
        }

        javaArgs.push(className);

        if (isDebug) {
            this.logger.warn(`🚀 Aguardando debugger na porta 5005 para ${className}...`);
            console.log(`Dica: No VS Code ou IntelliJ, use 'Attach to Remote JVM' na porta 5005.`);
            this.logger.newline();
        } else {
            this.logger.warn(`🚀 Executando ${className}...`);
        }

        const bin = getJavaPath();
        
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
        this.logger.info(`Sessão de ${isDebug ? "debug" : "execução"} encerrada.`);
    }

    private async discoverClass(simpleName: string): Promise<string | null> {
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
                this.logger.error(`Classe "${simpleName}" não encontrada nos diretórios de código (src/main/java, src/test/java, src).`);
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

        this.logger.warn(`Múltiplas classes encontradas para "${simpleName}":`);
        uniqueClasses.forEach((c, i) => {
            console.log(`  [${i + 1}] ${c}`);
        });

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(`  Escolha a classe (1-${uniqueClasses.length}) ou [C]ancelar: `, (answer: string) => {
                rl.close();
                const idx = parseInt(answer) - 1;
                if (!isNaN(idx) && uniqueClasses[idx]) {
                    resolve(uniqueClasses[idx]);
                } else {
                    this.logger.error("Operação cancelada.");
                    resolve(null);
                }
            });
        });
    }

    private async loadFromHistory(): Promise<string | null> {
        const xavvaDir = path.join(process.cwd(), ".xavva");
        const historyFile = path.join(xavvaDir, "history.json");

        if (!fs.existsSync(historyFile)) return null;

        try {
            const history: string[] = JSON.parse(fs.readFileSync(historyFile, "utf8"));
            if (history.length === 0) return null;

            this.logger.warn(`Classes executadas recentemente:`);
            history.slice(0, 5).forEach((c, i) => {
                console.log(`  [${i + 1}] ${c}${i === 0 ? " (Enter)" : ""}`);
            });

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            return new Promise((resolve) => {
                rl.question(`  Escolha a classe (1-${Math.min(history.length, 5)}) ou [C]ancelar: `, (answer: string) => {
                    rl.close();
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
        const xavvaDir = path.join(process.cwd(), ".xavva");
        const jarPath = path.join(xavvaDir, "classpath.jar");

        const sep = getClasspathSeparator();
        const paths = dependencyCp.split(sep).filter(p => p.trim());
        const relativePaths = paths.map(p => {
            let rel = normalizeClasspathPath(path.relative(xavvaDir, p));
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

    /**
     * Verifica se as classes compiladas existem, se não, executa o build
     * Usa build incremental (apenas compile, sem clean) para evitar conflitos
     * com o Tomcat que pode estar rodando e usando arquivos em target/
     */
    private async ensureCompiled(config: AppConfig): Promise<void> {
        // Usa build incremental (sem clean) para evitar problemas quando Tomcat está rodando
        if (this.buildService) {
            this.logger.step("Compilando projeto...");
            await this.buildService.runBuild(true); // true = incremental, sem clean
        } else {
            // Fallback: executa build via comando direto (apenas compile, sem clean)
            this.logger.step("Compilando projeto (fallback)...");
            const buildCmd = config.project.buildTool === "maven" 
                ? [getMavenCommand(), "compile", "-DskipTests"] 
                : [getGradleCommand(), "classes", "-x", "test"];
            
            const spinner = this.logger.spinner("Compilando");
            const proc = Bun.spawn(buildCmd, {
                stdout: "pipe",
                stderr: "pipe",
            });
            
            await proc.exited;
            spinner.stop();
            
            if (proc.exitCode !== 0) {
                throw new Error("Falha ao compilar o projeto. Verifique os erros acima.");
            }
        }
    }

    private async getClasspath(config: AppConfig): Promise<{ localCp: string, dependencyCp: string }> {
        const xavvaDir = path.join(process.cwd(), ".xavva");
        const cpFile = path.join(xavvaDir, "classpath.txt");

        if (!fs.existsSync(xavvaDir)) fs.mkdirSync(xavvaDir);

        if (!fs.existsSync(cpFile)) {
            const spinner = this.logger.spinner("Generating project classpath");
            try {
                if (config.project.buildTool === "maven") {
                    Bun.spawnSync([getMavenCommand(), "dependency:build-classpath", `-Dmdep.outputFile=${cpFile}`]);
                } else if (config.project.buildTool === "gradle") {
                    const gradleCmd = getGradleCommand();
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
                    Bun.spawnSync([gradleCmd, "-q", "printClasspath", "-I", initScriptPath]);
                    if (fs.existsSync(initScriptPath)) fs.unlinkSync(initScriptPath);
                } else {
                    fs.writeFileSync(cpFile, "."); 
                }
            } catch (e) {
                this.logger.error(`Falha ao gerar classpath: ${e}`);
            }
            spinner.stop();
        }

        let dependencyCp = fs.existsSync(cpFile) ? fs.readFileSync(cpFile, "utf8").trim() : "";
        
        // Normalize platform specific separators para o separador consistente
        const sep = getClasspathSeparator();
        if (path.delimiter !== sep) {
            dependencyCp = dependencyCp.split(path.delimiter).join(sep);
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
            .join(getClasspathSeparator());

        return { localCp, dependencyCp };
    }
}
