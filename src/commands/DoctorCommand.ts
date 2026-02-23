import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { Logger } from "../utils/ui";
import fs from "fs";
import path from "path";

export class DoctorCommand implements Command {
    async execute(config: AppConfig): Promise<void> {
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

        console.log("");
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
