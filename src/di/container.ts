/**
 * Container de Injeção de Dependência (DI) simplificado
 * Centraliza a criação e injeção de serviços
 */

import type { AppConfig } from "../types/config";
import { ProjectService } from "../services/ProjectService";
import { TomcatService } from "../services/TomcatService";
import { BuildService } from "../services/BuildService";
import { BuildCacheService } from "../services/BuildCacheService";
import { AuditService } from "../services/AuditService";
import { DashboardService } from "../services/DashboardService";
import { LogAnalyzer } from "../services/LogAnalyzer";
import { DeployCommand } from "../commands/DeployCommand";
import { BuildCommand } from "../commands/BuildCommand";
import { StartCommand } from "../commands/StartCommand";
import { LogsCommand } from "../commands/LogsCommand";
import { AuditCommand } from "../commands/AuditCommand";
import { ProfilesCommand } from "../commands/ProfilesCommand";
import { RunCommand } from "../commands/RunCommand";
import { HelpCommand } from "../commands/HelpCommand";
import { DoctorCommand } from "../commands/DoctorCommand";
import { DepsCommand } from "../commands/DepsCommand";
import { TomcatCommand } from "../commands/TomcatCommand";
import { EncodingCommand } from "../commands/EncodingCommand";
import { DocsCommand } from "../commands/DocsCommand";
import { InitCommand } from "../commands/InitCommand";
import { ConfigCommand } from "../commands/ConfigCommand";
import { HistoryCommand } from "../commands/HistoryCommand";
import { RedoCommand } from "../commands/RedoCommand";
import { HealthCommand } from "../commands/HealthCommand";
import { CompletionCommand } from "../commands/CompletionCommand";
import { ChangelogCommand } from "../commands/ChangelogCommand";
import { HistoryService } from "../services/HistoryService";
import { NotificationService } from "../services/NotificationService";
import type { Command } from "../commands/Command";
import { Logger } from "../utils/ui";

export interface Services {
    projectService: ProjectService;
    tomcatService: TomcatService;
    buildCacheService: BuildCacheService;
    buildService: BuildService;
    auditService: AuditService;
    dashboardService: DashboardService;
    logAnalyzer: LogAnalyzer;
    historyService: HistoryService;
}

export interface Commands {
    deploy: DeployCommand;
    dev: DeployCommand;
    build: BuildCommand;
    start: StartCommand;
    logs: LogsCommand;
    audit: AuditCommand;
    profiles: ProfilesCommand;
    run: RunCommand;
    debug: RunCommand;
    help: HelpCommand;
    doctor: DoctorCommand;
    deps: DepsCommand;
    tomcat: TomcatCommand;
    encoding: EncodingCommand;
    docs: DocsCommand;
    init: InitCommand;
    config: ConfigCommand;
    history: HistoryCommand;
    redo: RedoCommand;
    health: HealthCommand;
    completion: CompletionCommand;
    changelog: ChangelogCommand;
}

export class DIContainer {
    private config: AppConfig;
    private services: Partial<Services> = {};
    private commands: Partial<Commands> = {};
    private isInitialized = false;

    constructor(config: AppConfig) {
        this.config = config;
    }

    /**
     * Inicializa todos os serviços e comandos
     */
    initialize(): void {
        if (this.isInitialized) {
            Logger.debug("DI Container já inicializado");
            return;
        }

        this.initializeServices();
        this.initializeCommands();
        this.isInitialized = true;
    }

    private initializeServices(): void {
        // Serviços base (sem dependências ou com dependências simples)
        const projectService = new ProjectService(this.config.project);
        const buildCacheService = new BuildCacheService();
        const dashboardService = new DashboardService(this.config);
        const logAnalyzer = new LogAnalyzer(this.config.project);

        // Configura Logger com dashboard
        Logger.setDashboard(dashboardService);

        // Serviços com dependências
        const buildService = new BuildService(
            this.config.project,
            this.config.tomcat,
            projectService,
            buildCacheService
        );

        const tomcatService = new TomcatService(this.config.tomcat);
        tomcatService.setProjectService(projectService);

        const auditService = new AuditService(this.config.tomcat);
        const historyService = new HistoryService();

        this.services = {
            projectService,
            buildCacheService,
            buildService,
            tomcatService,
            auditService,
            dashboardService,
            logAnalyzer,
            historyService,
        };
    }

    private initializeCommands(): void {
        const { tomcatService, buildService, auditService, dashboardService, logAnalyzer } = this.services;

        if (!tomcatService || !buildService || !auditService || !dashboardService || !logAnalyzer) {
            throw new Error("Serviços não inicializados corretamente");
        }

        // Comandos que compartilham instâncias
        const deployCmd = new DeployCommand(tomcatService, buildService);
        const logsCmd = new LogsCommand(dashboardService, logAnalyzer);

        this.commands = {
            deploy: deployCmd,
            dev: deployCmd, // dev reusa deploy
            build: new BuildCommand(buildService),
            start: new StartCommand(tomcatService),
            logs: logsCmd,
            audit: new AuditCommand(auditService),
            profiles: new ProfilesCommand(this.services.projectService!),
            run: new RunCommand(),
            debug: new RunCommand(),
            help: new HelpCommand(),
            doctor: new DoctorCommand(),
            deps: new DepsCommand(),
            tomcat: new TomcatCommand(),
            encoding: new EncodingCommand(),
            docs: new DocsCommand(),
            init: new InitCommand(),
            config: new ConfigCommand(),
            history: new HistoryCommand(),
            redo: new RedoCommand(),
            health: new HealthCommand(),
            completion: new CompletionCommand(),
            changelog: new ChangelogCommand(),
        };
    }

    /**
     * Obtém um serviço pelo nome
     */
    getService<K extends keyof Services>(name: K): Services[K] {
        if (!this.isInitialized) {
            this.initialize();
        }
        const service = this.services[name];
        if (!service) {
            throw new Error(`Serviço '${name}' não encontrado no container`);
        }
        return service;
    }

    /**
     * Obtém um comando pelo nome
     */
    getCommand<K extends keyof Commands>(name: K): Commands[K] {
        if (!this.isInitialized) {
            this.initialize();
        }
        const command = this.commands[name];
        if (!command) {
            throw new Error(`Comando '${name}' não encontrado no container`);
        }
        return command;
    }

    /**
     * Obtém todos os serviços
     */
    getAllServices(): Services {
        if (!this.isInitialized) {
            this.initialize();
        }
        return this.services as Services;
    }

    /**
     * Obtém todos os comandos
     */
    getAllCommands(): Commands {
        if (!this.isInitialized) {
            this.initialize();
        }
        return this.commands as Commands;
    }

    /**
     * Registra um serviço customizado (útil para testes)
     */
    registerService<K extends keyof Services>(name: K, service: Services[K]): void {
        this.services[name] = service;
    }

    /**
     * Registra um comando customizado (útil para testes)
     */
    registerCommand<K extends keyof Commands>(name: K, command: Commands[K]): void {
        this.commands[name] = command;
    }
}

// Singleton para uso global
let globalContainer: DIContainer | null = null;

export function createContainer(config: AppConfig): DIContainer {
    globalContainer = new DIContainer(config);
    return globalContainer;
}

export function getContainer(): DIContainer {
    if (!globalContainer) {
        throw new Error("Container não inicializado. Chame createContainer primeiro.");
    }
    return globalContainer;
}

export function resetContainer(): void {
    globalContainer = null;
}
