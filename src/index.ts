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

import { ProjectService } from "./services/ProjectService";
import { TomcatService } from "./services/TomcatService";
import { BuildService } from "./services/BuildService";
import { AuditService } from "./services/AuditService";
import { WatcherService } from "./services/WatcherService";
import { BuildCacheService } from "./services/BuildCacheService";

import pkg from "../package.json";
import { Logger } from "./utils/ui";
import type { AppConfig, CLIArguments } from "./types/config";

async function main() {
	const { config, positionals, values } = await ConfigManager.load();

	if (values.version) {
		Logger.log(`v${pkg.version}`);
		process.exit(0);
	}

	const commandNames = ["deploy", "build", "start", "dev", "doctor", "run", "debug", "logs", "docs", "audit"];
	const commandName = positionals.find(p => commandNames.includes(p)) || "deploy";

	if (!values.help) {
		Logger.banner(commandName);
	}

	if (values.help) {
		new HelpCommand().execute(config, values);
		process.exit(0);
	}

	// 1. Instanciar Serviços (Injeção de Dependência)
	const projectService = new ProjectService(config.project);
	const buildCacheService = new BuildCacheService();
	const buildService = new BuildService(config.project, config.tomcat, projectService, buildCacheService);
	const tomcatService = new TomcatService(config.tomcat);
	tomcatService.setProjectService(projectService);
	const auditService = new AuditService(config.tomcat);

	// 2. Registrar Comandos
	const registry = new CommandRegistry();
	
	const deployCmd = new DeployCommand(tomcatService, buildService);
	
	registry.register("build", new BuildCommand(buildService));
	registry.register("start", new StartCommand(tomcatService));
	registry.register("doctor", new DoctorCommand());
	registry.register("run", new RunCommand());
	registry.register("debug", new RunCommand());
	registry.register("logs", new LogsCommand());
	registry.register("docs", new DocsCommand());
	registry.register("audit", new AuditCommand(auditService));
	registry.register("deploy", deployCmd);
	registry.register("dev", deployCmd);

	// Caso especial: Watch Mode para Deploy/Dev
	if ((commandName === "deploy" || commandName === "dev") && values.watch) {
		const watcher = new WatcherService(config, deployCmd);
		await watcher.start();
	} else {
		// 3. Executar do Registro
		// Ajusta flags baseadas no nome do comando para comandos compartilhados
		if (commandName === "debug") values.debug = true;
		if (commandName === "run") values.debug = false;
		
		await registry.execute(commandName, config, values);
	}
}

main().catch(console.error);
