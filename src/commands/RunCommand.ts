import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../logging";
import path from "path";
import fs from "fs";
import { glob } from "glob";
import readline from "readline";
import { BuildService } from "../services/BuildService";
import { BuildCacheService } from "../services/BuildCacheService";
import {
    getJavaPath,
    getMavenCommand,
    getGradleCommand,
    getClasspathSeparator,
    normalizeClasspathPath,
    isWindows,
} from "../utils/platform";

interface CompilationCheck {
    needsCompile: boolean;
    reason: string;
    changedFiles: string[];
}

export class RunCommand implements Command {
    private logger = Logger.getInstance();
    private buildCache: BuildCacheService;

    constructor(private buildService?: BuildService) {
        this.buildCache = new BuildCacheService();
    }

    async execute(config: AppConfig, args?: CLIArguments): Promise<void> {
        const isDebug = args?.debug === true;
        const attachLater = args?.["attach-later"] === true;
        const waitSeconds = args?.wait ? parseInt(args.wait) : 0;
        const usePrompt = args?.prompt === true;
        
        // Opções de build
        const fastMode = args?.fast === true || args?.["no-build"] === true;
        const forceBuild = args?.build === true;
        
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
        
        // Verifica/compila conforme modo
        await this.handleCompilation(config, { fastMode, forceBuild });
        
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
            let debugOptions: string;
            
            if (attachLater) {
                // Modo attach-later: não suspende, permite conectar depois
                debugOptions = "transport=dt_socket,server=y,suspend=n,address=5005";
                this.logger.info("Modo attach-later: aplicação vai iniciar imediatamente");
                this.logger.info("Você pode conectar o debugger a qualquer momento na porta 5005");
            } else {
                // Modo debug normal: suspende até conectar, sem timeout
                debugOptions = "transport=dt_socket,server=y,suspend=y,address=5005,timeout=0";
            }
            
            javaArgs.push(`-agentlib:jdwp=${debugOptions}`);
        }

        javaArgs.push(className);

        // Gerenciamento do debug attachment
        if (isDebug && !attachLater) {
            // Mostra instruções ANTES de iniciar o Java
            this.logger.warn(`🚀 Modo debug ativado na porta 5005`);
            this.logger.newline();
            this.logger.info("Instruções:");
            this.logger.info("  1. No VS Code: Ctrl+Shift+D → 'Attach to Remote JVM' → Start Debugging");
            this.logger.info("  2. No IntelliJ: Run → Attach to Process → selecione a porta 5005");
            this.logger.newline();
            
            // Countdown para o usuário conectar o debugger ANTES de iniciar Java
            const waitTime = waitSeconds > 0 ? waitSeconds : (usePrompt ? 0 : 10);
            
            if (waitTime > 0) {
                await this.waitCountdown(waitTime);
            } else {
                // Modo prompt manual
                await this.waitForPrompt();
            }
            
            this.logger.success("✓ Iniciando Java com debugger...");
            this.logger.info("O processo vai aguardar o debugger conectar.");
            this.logger.newline();
        } else if (!isDebug && !attachLater) {
            // Modo normal sem debug
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

    /**
     * Gerencia compilação com base nas opções
     */
    private async handleCompilation(
        config: AppConfig, 
        options: { fastMode: boolean; forceBuild: boolean }
    ): Promise<void> {
        const { fastMode, forceBuild } = options;

        // Modo fast: pula compilação completamente
        if (fastMode) {
            this.logger.info("Modo fast: pulando verificação de compilação");
            return;
        }

        // Forçar build
        if (forceBuild) {
            this.logger.step("Forçando compilação...");
            await this.runCompilation(config);
            return;
        }

        // Verificação inteligente padrão
        const check = await this.checkCompilationNeeded(config);
        
        if (!check.needsCompile) {
            this.logger.success(`✓ ${check.reason}`);
            return;
        }

        if (check.changedFiles.length > 0) {
            this.logger.info(`Arquivos modificados: ${check.changedFiles.length}`);
            if (check.changedFiles.length <= 5) {
                check.changedFiles.forEach(f => {
                    this.logger.info(`  • ${path.basename(f)}`);
                });
            }
        }

        await this.runCompilation(config);
    }

    /**
     * Verifica se compilação é necessária comparando timestamps
     */
    private async checkCompilationNeeded(config: AppConfig): Promise<CompilationCheck> {
        const srcDirs = this.getSourceDirectories();
        const outputDirs = this.getOutputDirectories(config);

        // Se não existe diretório de saída, precisa compilar
        const hasOutput = outputDirs.some(dir => fs.existsSync(dir));
        if (!hasOutput) {
            return {
                needsCompile: true,
                reason: "Diretório de classes não existe",
                changedFiles: []
            };
        }

        // Verifica timestamp dos arquivos fonte vs classes
        const changedFiles: string[] = [];
        let maxClassTimestamp = 0;

        // Encontra o timestamp mais recente dos arquivos .class
        for (const outDir of outputDirs) {
            if (fs.existsSync(outDir)) {
                const classes = this.findFiles(outDir, ".class");
                for (const cls of classes.slice(0, 100)) { // Limite para performance
                    try {
                        const stat = fs.statSync(cls);
                        if (stat.mtimeMs > maxClassTimestamp) {
                            maxClassTimestamp = stat.mtimeMs;
                        }
                    } catch {}
                }
            }
        }

        // Verifica se algum .java é mais novo que as classes
        for (const srcDir of srcDirs) {
            if (fs.existsSync(srcDir)) {
                const javaFiles = this.findFiles(srcDir, ".java");
                for (const javaFile of javaFiles) {
                    try {
                        const stat = fs.statSync(javaFile);
                        if (stat.mtimeMs > maxClassTimestamp) {
                            changedFiles.push(javaFile);
                        }
                    } catch {}
                }
            }
        }

        if (changedFiles.length === 0) {
            return {
                needsCompile: false,
                reason: "Nenhuma alteração desde última compilação",
                changedFiles: []
            };
        }

        return {
            needsCompile: true,
            reason: `${changedFiles.length} arquivo(s) modificado(s)`,
            changedFiles
        };
    }

    /**
     * Retorna diretórios de código fonte
     */
    private getSourceDirectories(): string[] {
        return [
            path.join(process.cwd(), "src/main/java"),
            path.join(process.cwd(), "src/test/java"),
            path.join(process.cwd(), "src"),
        ];
    }

    /**
     * Retorna diretórios de saída (classes compiladas)
     */
    private getOutputDirectories(config: AppConfig): string[] {
        if (config.project.buildTool === "maven") {
            return [
                path.join(process.cwd(), "target/classes"),
                path.join(process.cwd(), "target/test-classes"),
            ];
        } else if (config.project.buildTool === "gradle") {
            return [
                path.join(process.cwd(), "build/classes/java/main"),
                path.join(process.cwd(), "build/classes/java/test"),
                path.join(process.cwd(), "build/classes/kotlin/main"),
            ];
        }
        return [path.join(process.cwd(), "bin"), path.join(process.cwd(), "target/classes")];
    }

    /**
     * Encontra arquivos recursivamente
     */
    private findFiles(dir: string, extension: string): string[] {
        try {
            const pattern = path.join(dir, "**", `*${extension}`).replace(/\\/g, "/");
            return glob.sync(pattern);
        } catch {
            return [];
        }
    }

    /**
     * Executa compilação
     */
    private async runCompilation(config: AppConfig): Promise<void> {
        if (this.buildService) {
            this.logger.step("Compilando projeto...");
            await this.buildService.runBuild(true); // incremental
        } else {
            this.logger.step("Compilando projeto...");
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

    /**
     * Aguarda countdown com mensagem visual
     */
    private async waitCountdown(seconds: number): Promise<void> {
        this.logger.warn(`Aguardando ${seconds} segundos para conectar o debugger...`);
        this.logger.info("Conecte o debugger agora!");

        for (let i = seconds; i > 0; i--) {
            process.stdout.write(`\r  ${this.getSpinnerFrame(i)} Conecte o debugger agora... ${i}s `);
            await this.sleep(1000);
        }
        process.stdout.write("\r  ✓ Iniciando aplicação...                    \n");
        this.logger.newline();
    }

    /**
     * Aguarda usuário pressionar ENTER
     */
    private async waitForPrompt(): Promise<void> {
        // Limpa qualquer input residual no stdin (ex: do discoverClass)
        if (process.stdin.isTTY) {
            process.stdin.setRawMode && process.stdin.setRawMode(false);
        }
        
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question("  Pressione ENTER depois de conectar o debugger... ", () => {
                rl.close();
                resolve();
            });
        });
    }

    private getSpinnerFrame(index: number): string {
        const frames = ["◐", "◓", "◑", "◒"];
        return frames[index % frames.length];
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
            
            if (Buffer.from(currentLine + part).length > 70) {
                if (Buffer.from(" " + part).length > 70) {
                    let remainingPart = part;
                    while (remainingPart.length > 0) {
                        const spaceLeft = 70 - Buffer.from(currentLine).length;
                        
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
                    `.trim().replace(/^ {24}/gm, "");
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
