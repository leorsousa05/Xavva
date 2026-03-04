#!/usr/bin/env bun
import { ConfigManager } from "./utils/config";
import { CommandRegistry } from "./commands/CommandRegistry";
import { BuildCommand } from "./commands/BuildCommand";
import { DeployCommand } from "./commands/DeployCommand";
import { StartCommand } from "./commands/StartCommand";
import { HelpCommand } from "./commands/HelpCommand";
import { DoctorCommand } from "./commands/DoctorCommand";
import { RunCommand } from "./commands/RunCommand";
import { LogsCommand } from "./commands/LogsCommand";
import { DocsCommand } from "./commands/DocsCommand";
import { AuditCommand } from "./commands/AuditCommand";
import { ProfilesCommand } from "./commands/ProfilesCommand";
import { DepsCommand } from "./commands/DepsCommand";
import { TomcatCommand } from "./commands/TomcatCommand";

import { ProjectService } from "./services/ProjectService";
import { TomcatService } from "./services/TomcatService";
import { BuildService } from "./services/BuildService";
import { AuditService } from "./services/AuditService";
import { WatcherService } from "./services/WatcherService";
import { BuildCacheService } from "./services/BuildCacheService";
import { DashboardService } from "./services/DashboardService";
import { LogAnalyzer } from "./services/LogAnalyzer";

import pkg from "../package.json";
import { Logger } from "./utils/ui";
import { ProcessManager } from "./utils/processManager";
import type { AppConfig, CLIArguments } from "./types/config";

async function main() {
	const processManager = ProcessManager.getInstance();
	const { config, positionals, values } = await ConfigManager.load();

	if (values.version) {
		Logger.log(`v${pkg.version}`);
		await processManager.shutdown(0);
	}

	const commandNames = ["deploy", "build", "start", "dev", "doctor", "run", "debug", "logs", "docs", "audit", "profiles", "deps", "tomcat"];
	const commandName = positionals.find(p => commandNames.includes(p)) || "deploy";

	if (!values.help && !values.tui) {
		Logger.banner(commandName, config.project.profile, config.project.encoding);
		if (config.project.encoding) {
			Logger.config("Encoding", config.project.encoding);
		}
		if (config.tomcat.embedded) {
			Logger.config("Tomcat", `Embutido ${config.tomcat.version}`);
		}
	}

	if (values.help) {
		new HelpCommand().execute(config, values);
		await processManager.shutdown(0);
	}

	// 1. Instanciar Serviços (Injeção de Dependência)
	const projectService = new ProjectService(config.project);
	const buildCacheService = new BuildCacheService();
	const buildService = new BuildService(config.project, config.tomcat, projectService, buildCacheService);
	const tomcatService = new TomcatService(config.tomcat);
	tomcatService.setProjectService(projectService);
	const auditService = new AuditService(config.tomcat);
	
	// Xavva 2.0: Dashboard & LogAnalyzer
	const logAnalyzer = new LogAnalyzer(config.project);
	const dashboard = new DashboardService(config);
	Logger.setDashboard(dashboard);

	// 2. Registrar Comandos
	const registry = new CommandRegistry();
	
	const deployCmd = new DeployCommand(tomcatService, buildService);
	const logsCmd = new LogsCommand(dashboard, logAnalyzer);
	
	registry.register("build", new BuildCommand(buildService));
	registry.register("start", new StartCommand(tomcatService));
	registry.register("doctor", new DoctorCommand());
	registry.register("run", new RunCommand());
	registry.register("debug", new RunCommand());
	registry.register("logs", logsCmd);
	registry.register("docs", new DocsCommand());
	registry.register("audit", new AuditCommand(auditService));
	registry.register("profiles", new ProfilesCommand(projectService));
	registry.register("deps", new DepsCommand());
	registry.register("tomcat", new TomcatCommand());
	registry.register("deploy", deployCmd);
	registry.register("dev", deployCmd);

	// Caso especial: Watch Mode para Deploy/Dev
	if ((commandName === "deploy" || commandName === "dev") && values.watch) {
		// Registrar ação de restart manual na TUI
		if (dashboard.isTuiActive()) {
			dashboard.onAction("r", () => {
				dashboard.log(Logger.C.yellow + "Restart manual solicitado via TUI...");
				deployCmd.execute(config, false, true); // Executa deploy completo mas mantém o watch
			});
		}

		const watcher = new WatcherService(config, deployCmd);
		await watcher.start();
	} else {
		// 3. Executar do Registro
		if (commandName === "debug") values.debug = true;
		if (commandName === "run") values.debug = false;
		
		await registry.execute(commandName, config, values, positionals);
	}
}

main().catch(async (error) => {
	console.error(error);
	await ProcessManager.getInstance().shutdown(1);
});
