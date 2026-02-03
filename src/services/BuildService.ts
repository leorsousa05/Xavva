import { readdirSync, copyFileSync } from "fs";
import path from "path";

export class BuildService {
	constructor(private projectConfig: any, private tomcatConfig: any) { }

	async runBuild(incremental = false) {
		const command = [];
		
		if (this.projectConfig.buildTool === 'maven') {
			command.push("mvn");
			if (!incremental) command.push("clean");
			command.push("package", "-DskipTests");
		} else {
			command.push("gradle");
			if (!incremental) command.push("clean");
			command.push("build", "-x", "test");
		}

		console.log(`[Build] Executando ${command.join(' ')}...`);

		const proc = Bun.spawn(command, { stdout: "inherit" });
		await proc.exited;

		if (proc.exitCode !== 0) throw new Error("Falha no build do Java!");
	}

	async deployToWebapps() {
		const targetDir = this.projectConfig.buildTool === 'maven' ? 'target' : 'build/libs';
		const sourceDir = path.join(process.cwd(), targetDir);
		const destDir = path.join(this.tomcatConfig.path, this.tomcatConfig.webapps);

		const files = readdirSync(sourceDir).filter(f => f.endsWith('.war'));
		if (files.length === 0) throw new Error('Nenhum arquivo .war encontrado!');

		const warFile = files[0];
		const finalName = this.projectConfig.appName ? `${this.projectConfig.appName}.war` : warFile;

		console.log(`[Deploy] Movendo para ${finalName}...`);
		copyFileSync(path.join(sourceDir, warFile), path.join(destDir, finalName));
	}
}
