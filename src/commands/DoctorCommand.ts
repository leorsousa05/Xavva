import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { Logger } from "../utils/ui";
import fs from "fs";
import path from "path";

export class DoctorCommand implements Command {
	async execute(config: AppConfig, values: any = {}): Promise<void> {
		Logger.section("Xavva Doctor - Ambiente");

		this.check(
			"JAVA_HOME",
			!!process.env.JAVA_HOME,
			process.env.JAVA_HOME || "Não definido",
		);

		const jvmInfo = this.checkJVM();
		this.check(
			"JVM Type",
			jvmInfo.dcevm,
			jvmInfo.name +
			(jvmInfo.dcevm ? " (Advanced Hot Reload OK)" : " (Standard)"),
		);

		if (!jvmInfo.dcevm) {
			Logger.log(
				`    ${Logger.C.yellow}💡 Dica: Sua JVM não suporta mudanças estruturais (novos métodos/campos).${Logger.C.reset}`,
			);
			if (values.fix) {
				await this.installDCEVM();
			} else {
				Logger.log(
					`    ${Logger.C.cyan}Use 'xavva doctor --fix' para baixar uma JDK com DCEVM integrado.${Logger.C.reset}`,
				);
			}
		}

		const tomcatOk = fs.existsSync(config.tomcat.path);
		this.check("Tomcat Path", tomcatOk, config.tomcat.path);

		if (tomcatOk) {
			const binOk = fs.existsSync(
				path.join(config.tomcat.path, "bin", "catalina.bat"),
			);
			this.check(
				"Tomcat Bin",
				binOk,
				binOk ? "OK" : "catalina.bat não encontrado",
			);
		}

		const mvnOk = this.checkBinary("mvn");
		this.check("Maven", mvnOk, mvnOk ? "Disponível" : "Não encontrado no PATH");

		const gradleOk = this.checkBinary("gradle") || this.checkBinary("gradlew");
		this.check(
			"Gradle",
			gradleOk,
			gradleOk ? "Disponível" : "Não encontrado no PATH",
		);

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
					if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
						filesWithBOM.push(res);
					}
				}
			}
		};

		scan(srcPath);

		if (filesWithBOM.length > 0) {
			this.check(
				"Encoding BOM",
				false,
				`${filesWithBOM.length} arquivos com BOM (UTF-8 com assinatura)`,
			);
			if (fix) {
				for (const file of filesWithBOM) {
					const buffer = fs.readFileSync(file);
					const cleanBuffer = buffer.subarray(3);
					fs.writeFileSync(file, cleanBuffer);
					console.log(
						`    \x1b[32m✔\x1b[0m Corrigido: ${path.basename(file)}`,
					);
				}
				Logger.success("BOM removido de todos os arquivos!");
			} else {
				Logger.warn(
					"Use 'xavva doctor --fix' para remover o BOM automaticamente.",
				);
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
			const proc = Bun.spawnSync([
				process.platform === "win32" ? "where" : "which",
				name,
			]);
			return proc.exitCode === 0;
		} catch {
			return false;
		}
	}

    private checkJVM(): { name: string, dcevm: boolean } {
        try {
            // Tentar primeiro o binário do JAVA_HOME para evitar cache do Path
            let javaBin = "java";
            if (process.env.JAVA_HOME) {
                const homeBin = path.join(process.env.JAVA_HOME, "bin", "java.exe");
                if (fs.existsSync(homeBin)) javaBin = homeBin;
            }

            const proc = Bun.spawnSync([javaBin, "-version"]);
            const output = (proc.stderr.toString() + proc.stdout.toString()).toLowerCase();
            const isDcevm = output.includes("dcevm") || 
                            output.includes("jetbrains") || 
                            output.includes("trava") || 
                            output.includes("jbr");
            
            const versionMatch = output.match(/version "(.*?)"/);
            return {
                name: versionMatch ? `Java ${versionMatch[1]}` : "Java Desconhecido",
                dcevm: isDcevm
            };
        } catch {
            return { name: "Não encontrada", dcevm: false };
        }
    }

    private async installDCEVM() {
        Logger.section("Instalação do JetBrains Runtime (JBR 21)");
        Logger.log("Baixando JDK moderna com DCEVM nativo (JBR 21 SDK)...");
        
        // URL para o JetBrains Runtime 21 SDK Windows x64
        const url = "https://cache-redirector.jetbrains.com/intellij-jbr/jbrsdk-21.0.6-windows-x64-b895.97.tar.gz";
        const installDir = path.join(require("os").homedir(), ".xavva", "jdk-dcevm");
        
        // Limpar instalação anterior se existir
        if (fs.existsSync(installDir)) {
            try {
                fs.rmSync(installDir, { recursive: true, force: true });
            } catch (e) {}
        }
        fs.mkdirSync(installDir, { recursive: true });

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Erro ao baixar JBR (verifique sua conexão)");
            const buffer = await response.arrayBuffer();
            const tarPath = path.join(installDir, "jbr.tar.gz");
            fs.writeFileSync(tarPath, Buffer.from(buffer));
            
            Logger.success("Download concluído. Extraindo binários...");
            
            // Usar PowerShell para extrair .tar.gz (nativo no Windows 10/11)
            const extractCmd = `powershell -command "tar -xzf '${tarPath}' -C '${installDir}'"`;
            Bun.spawnSync(["powershell", "-command", extractCmd]);
            
            fs.rmSync(tarPath);

            // Busca recursiva para encontrar onde está o bin/java.exe
            const findJdkRoot = (dir: string): string | null => {
                if (fs.existsSync(path.join(dir, "bin", "java.exe"))) return dir;
                const subdirs = fs.readdirSync(dir, { withFileTypes: true })
                    .filter(d => d.isDirectory())
                    .map(d => path.join(dir, d.name));
                for (const subdir of subdirs) {
                    const found = findJdkRoot(subdir);
                    if (found) return found;
                }
                return null;
            };

            const jdkPath = findJdkRoot(installDir) || installDir;
			            
			                                    Logger.process("Configurando variáveis de ambiente do SISTEMA...");
			                        
			                                                const setEnvCmd = `
			                                                    $jdk = '${jdkPath}';
			                                                    $bin = '${path.join(jdkPath, "bin")}';
			                                                    try {
			                                                        [Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk, 'Machine');
			                                                        $pathVar = [Environment]::GetEnvironmentVariable('Path', 'Machine');
			                                                        $paths = $pathVar -split ';' | Where-Object { $_ -ne '' };
			                                                        $normalizedBin = $bin.TrimEnd('\\').ToLower();
			                                                        
			                                                        $exists = $false;
			                                                        foreach ($p in $paths) {
			                                                            if ($p.TrimEnd('\\').ToLower() -eq $normalizedBin) { $exists = $true; break; }
			                                                        }
			                                    
			                                                        if (-not $exists) {
			                                                            $newPath = "$bin;" + $pathVar;
			                                                            [Environment]::SetEnvironmentVariable('Path', $newPath, 'Machine');
			                                                        }
			                                                        Write-Output "OK";
			                                                    } catch {
			                                                        Write-Error $_.Exception.Message;
			                                                    }
			                                                `.replace(/\n/g, ' ');
			                                    			                                    const result = Bun.spawnSync(["powershell", "-command", setEnvCmd]);
			                                    const output = result.stdout.toString() + result.stderr.toString();
			                        
			                                    if (output.includes("ACCESS_DENIED")) {
			                                        Logger.error("Falha ao configurar variáveis do SISTEMA (Acesso Negado).");
			                                        Logger.warn("Dica: Execute o terminal como ADMINISTRADOR para permitir esta alteração.");
			                                        Logger.info("JAVA_HOME manual", jdkPath);
			                                    } else {
			                                        Logger.success(`DCEVM configurado no SISTEMA com sucesso!`);
			                                        Logger.info("JAVA_HOME", jdkPath);
			                                    }
			                        
			                                    Logger.newline();
			                                    Logger.warn("IMPORTANTE: Reinicie seu terminal (ou o VS Code) para as mudanças surtirem efeito.");
			                                } catch (e: any) {
			                        
			            			Logger.error(`Falha na instalação: ${e.message}`);
		}
	}
}
