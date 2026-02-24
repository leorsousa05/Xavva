#!/usr/bin/env bun
import { watch } from "fs";
import { ConfigManager } from "./utils/config";
import { BuildCommand } from "./commands/BuildCommand";
import { DeployCommand } from "./commands/DeployCommand";
import { StartCommand } from "./commands/StartCommand";
import { HelpCommand } from "./commands/HelpCommand";
import { DoctorCommand } from "./commands/DoctorCommand";
import { RunCommand } from "./commands/RunCommand";
import { LogsCommand } from "./commands/LogsCommand";
import { DocsCommand } from "./commands/DocsCommand";
import { AuditCommand } from "./commands/AuditCommand";
import { TomcatService } from "./services/TomcatService";
import { EndpointService } from "./services/EndpointService";
import pkg from "../package.json";
import { Logger } from "./utils/ui";
import path from "path";

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
		new HelpCommand().execute(config);
		process.exit(0);
	}

	switch (commandName) {
		case "build":
			await new BuildCommand().execute(config);
			break;
		case "start":
			await new StartCommand().execute(config);
			break;
		case "doctor":
			await new DoctorCommand().execute(config, values);
			break;
		case "run":
			await new RunCommand(false).execute(config);
			break;
		case "debug":
			await new RunCommand(true).execute(config);
			break;
		case "logs":
			await new LogsCommand().execute(config);
			break;
		case "docs":
			await new DocsCommand().execute(config);
			break;
		case "audit":
			await new AuditCommand().execute(config);
			break;
		case "dev":
		case "deploy":
			await handleDeploy(config, values);
			break;
		default:
			Logger.error(`Comando desconhecido: ${commandName}`);
			new HelpCommand().execute(config);
			process.exit(1);
	}
}

async function handleDeploy(config: any, values: any) {
	const tomcat = new TomcatService(config.tomcat);
	const deployCmd = new DeployCommand(tomcat);
	
	if (values.watch) {
		let isDeploying = false;

		const run = async (incremental = false) => {
			if (isDeploying) return;
			isDeploying = true;
			try {
				await deployCmd.execute(config, incremental, true);
			} catch (e) {
			} finally {
				isDeploying = false;
			}
		};

		await run(false);

		let debounceTimer: Timer;
		const coolingFiles = new Set<string>();

		watch(process.cwd(), { recursive: true }, async (event, filename) => {
			if (!filename) return;

			if (coolingFiles.has(filename)) return;
			coolingFiles.add(filename);
			setTimeout(() => coolingFiles.delete(filename), 500);

			const isJava = filename.endsWith(".java") || filename === "pom.xml" || filename === "build.gradle";
			const isResource = filename.endsWith(".jsp") || filename.endsWith(".html") || 
							   filename.endsWith(".css") || filename.endsWith(".js") || 
							   filename.endsWith(".xml") || filename.endsWith(".properties");
			
			const isIgnored = filename.includes("target") || 
							  filename.includes("build") || 
							  filename.includes("node_modules") || 
							  filename.split(/[/\\]/).some(part => part.startsWith("."));

			if (isIgnored) return;

			if (isResource && !isJava) {
				const isJsp = filename.endsWith(".jsp");
				let jspUrl = "";
				let isPrivate = false;

				if (isJsp) {
					const parts = filename.split(/[/\\]/);
					const webappIndex = parts.indexOf("webapp");
					const webContentIndex = parts.indexOf("WebContent");
					const rootIndex = webappIndex !== -1 ? webappIndex : webContentIndex;

					if (rootIndex !== -1) {
						const relPath = parts.slice(rootIndex + 1).join("/");
						isPrivate = relPath.startsWith("WEB-INF") || relPath.startsWith("META-INF");
						
						let contextPath = (config.project.appName || "").replace(".war", "");
						if (!contextPath) {
							const webappsPath = require("path").join(config.tomcat.path, "webapps");
							if (require("fs").existsSync(webappsPath)) {
								const folders = require("fs").readdirSync(webappsPath, { withFileTypes: true })
									.filter((dirent: any) => dirent.isDirectory() && !["ROOT", "manager", "host-manager", "docs"].includes(dirent.name));
								if (folders.length === 1) contextPath = folders[0].name;
							}
						}

						jspUrl = `http://localhost:${config.tomcat.port}${contextPath ? "/" + contextPath : ""}/${relPath}`;
					}
				}

				if (isJsp && isPrivate) {
					Logger.watcher(`JSP Private (WEB-INF): ${filename}`, 'change');
					Logger.dim(`Nota: Este arquivo não é acessível via URL direta.`);
				} else if (isJsp && jspUrl) {
					Logger.watcher(`JSP Updated: ${jspUrl}`, 'success');
				} else {
					Logger.watcher(`Resource altered: ${filename}`, 'change');
				}

				await deployCmd.syncResource(config, filename);
				return;
			}

			if (!isJava) return;

			Logger.watcher(filename, 'watch');
			clearTimeout(debounceTimer);
			
			debounceTimer = setTimeout(() => {
				run(true);
			}, 1000);
		});

	} else {
		await deployCmd.execute(config, false, false);
	}
}

main().catch(console.error);
