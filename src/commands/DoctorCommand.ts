import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { Logger } from "../utils/ui";
import fs from "fs";
import path from "path";

export class DoctorCommand implements Command {
    async execute(config: AppConfig, values: any = {}): Promise<void> {
        Logger.section("Xavva Doctor - Ambiente");

        this.check("JAVA_HOME", !!process.env.JAVA_HOME, process.env.JAVA_HOME || "Não definido");
        
        const tomcatOk = fs.existsSync(config.tomcat.path);
        this.check("Tomcat Path", tomcatOk, config.tomcat.path);
        
        if (tomcatOk) {
            const binOk = fs.existsSync(path.join(config.tomcat.path, "bin", "catalina.bat"));
            this.check("Tomcat Bin", binOk, binOk ? "OK" : "catalina.bat não encontrado");
        }

        const mvnOk = this.checkBinary("mvn");
        this.check("Maven", mvnOk, mvnOk ? "Disponível" : "Não encontrado no PATH");

        const gradleOk = this.checkBinary("gradle") || this.checkBinary("gradlew");
        this.check("Gradle", gradleOk, gradleOk ? "Disponível" : "Não encontrado no PATH");

        const gitOk = this.checkBinary("git");
        this.check("Git", gitOk, gitOk ? "Disponível" : "Não encontrado no PATH");

        Logger.section("Xavva Doctor - Integridade de Arquivos");
        await this.checkBOM(values.fix);

        console.log("");
    }

    private async checkBOM(fix: boolean) {
        const srcPath = path.join(process.cwd(), "src");
        if (!fs.existsSync(srcPath)) return;

        const filesWithBOM: string[] = [];
        const scan = (dir: string) => {
            const list = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of list) {
                const res = path.resolve(dir, item.name);
                if (item.isDirectory()) {
                    scan(res);
                } else if (item.name.endsWith(".java")) {
                    const buffer = fs.readFileSync(res);
                    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                        filesWithBOM.push(res);
                    }
                }
            }
        };

        scan(srcPath);

        if (filesWithBOM.length > 0) {
            this.check("Encoding BOM", false, `${filesWithBOM.length} arquivos com BOM (UTF-8 com assinatura)`);
            if (fix) {
                for (const file of filesWithBOM) {
                    const buffer = fs.readFileSync(file);
                    const cleanBuffer = buffer.subarray(3);
                    fs.writeFileSync(file, cleanBuffer);
                    console.log(`    \x1b[32m✔\x1b[0m Corrigido: ${path.basename(file)}`);
                }
                Logger.success("BOM removido de todos os arquivos!");
            } else {
                Logger.warn("Use 'xavva doctor --fix' para remover o BOM automaticamente.");
            }
        } else {
            this.check("Encoding BOM", true, "Nenhum arquivo com BOM detectado.");
        }
    }

    private check(label: string, ok: boolean, detail: string) {
        const icon = ok ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✘\x1b[0m";
        console.log(`  ${icon} ${label.padEnd(15)} ${detail}`);
    }

    private checkBinary(name: string): boolean {
        try {
            const proc = Bun.spawnSync([process.platform === 'win32' ? "where" : "which", name]);
            return proc.exitCode === 0;
        } catch {
            return false;
        }
    }
}
