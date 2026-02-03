import { parseArgs } from "util";
import { TomcatService } from "./services/TomcatService";
import { BuildService } from "./services/BuildService";
import { config as defaultConfig } from "../config";

const { values } = parseArgs({
	args: Bun.argv,
	options: {
		path: { type: "string", short: "p" },
		tool: { type: "string", short: "t" },
		name: { type: "string", short: "n" },
		port: { type: "string" },
		"no-build": { type: "boolean", short: "s" },
		clean: { type: "boolean", short: "c" },
		help: { type: "boolean", short: "h" },
	},
	strict: false,
	allowPositionals: true,
});

if (values.help) {
	console.log(`
🛠️  Deployer CLI - Manual de Uso
-------------------------------
Opções:
  -p, --path    Caminho base do Tomcat
  -t, --tool    Ferramenta de build (maven/gradle)
  -n, --name    Nome customizado para o arquivo .war
  --port        Porta do servidor (padrão: 8080)
  -s, --no-build Pula a etapa de compilação
  -c, --clean   Logs do Tomcat simplificados e coloridos
  -h, --help    Exibe este menu de ajuda
	`);
	process.exit(0);
}

const activeConfig = {
	tomcat: {
		path: String(values.path || defaultConfig.tomcat.path),
		port: parseInt(String(values.port || defaultConfig.tomcat.port)),
		webapps: defaultConfig.tomcat.webapps,
	},
	project: {
		appName: String(values.name || defaultConfig.project.appName),
		buildTool: (values.tool as "maven" | "gradle") || defaultConfig.project.buildTool,
		skipBuild: !!values["no-build"],
		cleanLogs: !!values.clean,
	}
};

const tomcat = new TomcatService(activeConfig.tomcat);
const builder = new BuildService(activeConfig.project, activeConfig.tomcat);

async function main() {
	console.log(`\n🛠️  Iniciando Deployer CLI`);
	console.log(`--------------------------`);
	console.log(`> Ferramenta: ${activeConfig.project.buildTool.toUpperCase()}`);
	console.log(`> App Name:   ${activeConfig.project.appName}`);
	console.log(`> Build:      ${activeConfig.project.skipBuild ? "PULADO" : "ATIVO"}\n`);

	try {
		await tomcat.killConflict();

		if (!activeConfig.project.skipBuild) {
			await builder.runBuild();
		} else {
			console.log(`[Skip] Saltando etapa de build...`);
		}

		await builder.deployToWebapps();
		tomcat.start(activeConfig.project.cleanLogs);
	} catch (error: any) {
		console.error('\n❌ Erro:', error.message);
		process.exit(1);
	}
}

main();
