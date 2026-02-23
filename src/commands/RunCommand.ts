import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { Logger } from "../utils/ui";
import { spawn } from "child_process";
import path from "path";

export class RunCommand implements Command {
    constructor(private debug: boolean = true) {}

    async execute(config: AppConfig): Promise<void> {
        let className = config.project.grep;
        
        if (!className) {
            className = await this.loadFromHistory();
            if (!className) {
                Logger.error(`Uso: xavva ${this.debug ? "debug" : "run"} NomeDaClasse`);
                return;
            }
        }

        if (!className.includes(".")) {
            const discoveredClass = await this.discoverClass(className);
            if (!discoveredClass) return;
            className = discoveredClass;
        }

        this.saveToHistory(className);

        if (this.debug) {
            Logger.section(`Interactive Debug: ${className}`);
        } else {
            Logger.section(`Running: ${className}`);
        }
        
        const { localCp, dependencyCp } = await this.getClasspath(config);
        const pathingJar = await this.createPathingJar(dependencyCp);
        
        const finalCp = `${localCp};${pathingJar}`;

        const args = [
            "-classpath", finalCp,
        ];

        if (this.debug) {
            args.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005");
        }

        args.push(className);

        if (this.debug) {
            Logger.warn(`🚀 Aguardando debugger na porta 5005 para ${className}...`);
            Logger.log(`${"\x1b[36m"}Dica:${"\x1b[0m"} No VS Code ou IntelliJ, use 'Attach to Remote JVM' na porta 5005.\n`);
        } else {
            Logger.warn(`🚀 Executando ${className}...`);
        }

        const bin = "java";
        
        return new Promise((resolve) => {
            const child = spawn(bin, args, {
                stdio: "inherit",
                shell: true
            });

            child.on("exit", () => {
                Logger.log(`Sessão de ${this.debug ? "debug" : "execução"} encerrada.`);
                resolve();
            });
        });
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
            readline.question(`\n  Escolha a classe (1-${uniqueClasses.length}) ou [C]ancelar: `, (answer: string) => {
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
                readline.question(`\n  Escolha a classe (1-${Math.min(history.length, 5)}) ou [C]ancelar: `, (answer: string) => {
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
            if (fs.statSync(p).isDirectory() && !rel.endsWith("/")) rel += "/";
            return rel;
        }).join(" ");

        let wrappedCp = "";
        const maxLen = 70;
        for (let i = 0; i < relativePaths.length; i += maxLen) {
            const chunk = relativePaths.substring(i, i + maxLen);
            if (i === 0) {
                wrappedCp += chunk;
            } else {
                wrappedCp += "\r\n " + chunk;
            }
        }

        const manifestContent = `Manifest-Version: 1.0\r\nClass-Path: ${wrappedCp}\r\n\r\n`;
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
                if (config.project.buildTool === 'maven') {
                    Bun.spawnSync(["mvn", "dependency:build-classpath", `-Dmdep.outputFile=${cpFile}`]);
                } else {
                    fs.writeFileSync(cpFile, "."); 
                }
            } catch (e) {}
            stopSpinner();
        }

        const dependencyCp = fs.existsSync(cpFile) ? fs.readFileSync(cpFile, "utf8").trim() : "";
        
        const localFolders = [
            "target/classes",
            "target/test-classes",
            "build/classes/java/main",
            "build/classes/java/test",
            "."
        ];
        
        const localCp = localFolders
            .map(p => path.join(process.cwd(), p))
            .filter(p => fs.existsSync(p))
            .join(";");

        return { localCp, dependencyCp };
    }
}
