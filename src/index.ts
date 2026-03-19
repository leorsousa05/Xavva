#!/usr/bin/env bun
import { ConfigManager } from "./utils/config";
import { CommandRegistry } from "./commands/CommandRegistry";
import { createContainer, type DIContainer } from "./di/container";
import { DeployWatcher } from "./services/DeployWatcher";
import { ErrorHandler } from "./errors/ErrorHandler";
import { ProcessManager } from "./utils/processManager";
import { LoggerLevel } from "./utils/LoggerLevel";
import pkg from "../package.json";
import { Logger } from "./utils/ui";
import type { CLIArguments } from "./types/args";

async function main() {
    const processManager = ProcessManager.getInstance();
    const { config, positionals, values } = await ConfigManager.load();

    // Handler de versão
    if (values.version) {
        Logger.log(`v${pkg.version}`);
        await processManager.shutdown(0);
    }

    // Configura debug level
    if (values["debug-level"]) {
        LoggerLevel.setLevel(values["debug-level"]);
        LoggerLevel.verbose(`Debug level set to: ${values["debug-level"]}`, {});
    }

    // Identifica comando
    const commandNames = [
        "deploy", "build", "start", "dev", "doctor", "run", 
        "debug", "logs", "docs", "audit", "profiles", 
        "deps", "tomcat", "encoding", "init", "config", 
        "history", "redo", "health", "completion", "changelog",
        "test", "db", "http", "docker", "help"
    ];
    const commandName = positionals.find(p => commandNames.includes(p)) || "deploy";

    // Mostra banner (exceto em help ou TUI)
    if (!values.help && !values.tui) {
        Logger.banner(commandName, config.project.profile, config.project.encoding);
        if (config.project.encoding) {
            Logger.config("Encoding", config.project.encoding);
        }
        if (config.tomcat.embedded) {
            Logger.config("Tomcat", `Embutido ${config.tomcat.version}`);
        }
    }

    // Handler de help
    if (values.help) {
        // Se for help de comando específico, deixa o comando tratar
        if (commandName !== "help" && commandName !== "deploy") {
            // O comando específico vai tratar o --help
        } else {
            // Help geral
            const { HelpCommand } = await import("./commands/HelpCommand");
            new HelpCommand().execute(config, values as CLIArguments);
            await processManager.shutdown(0);
        }
    }

    // Inicializa Container de DI
    let container: DIContainer;
    try {
        container = createContainer(config);
        container.initialize();
    } catch (error) {
        await ErrorHandler.getInstance().handle(error, { phase: "di-initialization" });
        return;
    }

    const services = container.getAllServices();
    const commands = container.getAllCommands();

    // Configura ações da TUI
    if (values.tui) {
        const deployCmd = commands.deploy;
        services.dashboardService.onAction("r", () => {
            services.dashboardService.log(Logger.C.warning + "Restart manual solicitado via TUI...");
            deployCmd.execute(config, { watch: true, incremental: false });
        });
    }

    // Caso especial: Watch Mode para Deploy/Dev
    if ((commandName === "deploy" || commandName === "dev") && values.watch) {
        const deployCmd = commands.deploy;
        const watcher = new DeployWatcher(config, deployCmd);
        
        try {
            await watcher.start();
        } catch (error) {
            await ErrorHandler.getInstance().handle(error, { phase: "watch-mode", command: commandName });
        }
    } else {
        // Executa comando do Registry
        const registry = new CommandRegistry();
        
        // Registra todos os comandos
        registry.register("build", commands.build);
        registry.register("start", commands.start);
        registry.register("doctor", commands.doctor);
        registry.register("run", commands.run);
        registry.register("debug", commands.debug);
        registry.register("logs", commands.logs);
        registry.register("docs", commands.docs);
        registry.register("audit", commands.audit);
        registry.register("profiles", commands.profiles);
        registry.register("deps", commands.deps);
        registry.register("tomcat", commands.tomcat);
        registry.register("encoding", commands.encoding);
        registry.register("deploy", commands.deploy);
        registry.register("dev", commands.dev);
        registry.register("init", commands.init);
        registry.register("config", commands.config);
        registry.register("history", commands.history);
        registry.register("redo", commands.redo);
        registry.register("health", commands.health);
        registry.register("completion", commands.completion);
        registry.register("changelog", commands.changelog);
        registry.register("test", commands.test);
        registry.register("db", commands.db);
        registry.register("http", commands.http);
        registry.register("docker", commands.docker);

        // Configura flags específicas
        if (commandName === "debug") values.debug = true;
        if (commandName === "run") values.debug = false;

        // Registra comando no histórico antes da execução
        const startTime = Date.now();
        let success = true;

        try {
            await registry.execute(commandName, config, values as CLIArguments, positionals);
        } catch (error) {
            success = false;
            await ErrorHandler.getInstance().handle(error, { phase: "command-execution", command: commandName });
        } finally {
            // Salva no histórico
            const duration = (Date.now() - startTime) / 1000;
            const filteredPositionals = positionals.filter(p => p !== commandName && !commandNames.includes(p));
            services.historyService.add({
                command: commandName,
                args: [...filteredPositionals, ...Object.entries(values)
                    .filter(([, v]) => v !== undefined && typeof v !== "object")
                    .flatMap(([k, v]) => [`--${k}`, String(v)])],
                success,
                duration
            }).catch(() => { /* ignore history errors */ });

            // Envia notificação para comandos longos
            if (duration > 5 && commandName !== "logs" && commandName !== "history") {
                const { NotificationService } = await import("./services/NotificationService");
                if (success) {
                    if (commandName === "build" || commandName === "deploy") {
                        NotificationService.buildSuccess(duration);
                    } else if (commandName === "start") {
                        NotificationService.deployComplete(config.project.appName);
                    }
                } else {
                    NotificationService.buildFailed(`Comando ${commandName} falhou`);
                }
            }
        }
    }
}

// Entry point com tratamento global de erros
main().catch(async (error) => {
    // Erro não tratado - possível bug
    console.error("Erro fatal não tratado:", error);
    await ProcessManager.getInstance().shutdown(1);
});
