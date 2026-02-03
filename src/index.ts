import { parseArgs } from "util";
import { watch } from "fs";
import { TomcatService } from "./services/TomcatService";
import { BuildService } from "./services/BuildService";
import { config as defaultConfig } from "../config";
import pkg from "../package.json";

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
		version: { type: "boolean", short: "v" },
		watch: { type: "boolean", short: "w" },
	},
	strict: false,
	allowPositionals: true,
});

if (values.version) {
	console.log(`v${pkg.version}`);
	process.exit(0);
}

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
  -w, --watch   Modo Watch (Hot Reload)
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

let isDeploying = false;

async function deploy(incremental = false) {
	if (isDeploying) return;
	isDeploying = true;

	console.log(`\n🛠️  Iniciando Deployer CLI`);
	console.log(`--------------------------`);
	console.log(`> Ferramenta: ${activeConfig.project.buildTool.toUpperCase()}`);
	console.log(`> App Name:   ${activeConfig.project.appName}`);
	console.log(`> Build:      ${activeConfig.project.skipBuild ? "PULADO" : "ATIVO"}`);
	if (values.watch) console.log(`> Modo Watch: ATIVO`);
	console.log("");

	try {
		await tomcat.killConflict();

		if (!activeConfig.project.skipBuild) {
			await builder.runBuild(incremental);
		} else {
			console.log(`[Skip] Saltando etapa de build...`);
		}

		await builder.deployToWebapps();
		tomcat.start(activeConfig.project.cleanLogs);
	} catch (error: any) {
		console.error('\n❌ Erro:', error.message);
		if (!values.watch) process.exit(1);
	} finally {
		isDeploying = false;
	}
}

if (values.watch) {
	console.log(`\n👀 Modo Watch ativado! Monitorando alterações em ${process.cwd()}...`);
	deploy();

	let debounceTimer: Timer;
	watch(process.cwd(), { recursive: true }, (event, filename) => {
		if (!filename) return;
		if (filename.includes("target") || filename.includes("build") || filename.includes(".git") || filename.includes("node_modules")) return;

		console.log(`\n[Watch] Alteração detectada em: ${filename}`);
		clearTimeout(debounceTimer);
		
		// @ts-ignore
		debounceTimer = setTimeout(() => {
			tomcat.stop();
			deploy(true);
		}, 1000);
	});
} else {
	deploy();
}
