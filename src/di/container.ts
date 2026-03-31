/**
 * Container de Injeção de Dependência (DI) com Lazy Loading
 * 
 * Características:
 * - Serviços são criados apenas quando necessários
 * - Cache de instâncias para reuso
 * - Inicialização rápida (só cria o essencial)
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
import { TestCommand } from "../commands/TestCommand";
import { DbCommand } from "../commands/DbCommand";
import { HttpCommand } from "../commands/HttpCommand";
import { DockerCommand } from "../commands/DockerCommand";
import { CleanCommand } from "../commands/CleanCommand";
import { IdeCommand } from "../commands/IdeCommand";
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
    test: TestCommand;
    db: DbCommand;
    http: HttpCommand;
    docker: DockerCommand;
    clean: CleanCommand;
    ide: IdeCommand;
}

// Tipo para factory functions
type ServiceFactory<T> = () => T;
type CommandFactory<T> = (services: Services) => T;

export class DIContainer {
    private config: AppConfig;
    
    // Cache de instâncias criadas
    private serviceCache: Partial<Services> = {};
    private commandCache: Partial<Commands> = {};
    
    // Factories para lazy loading
    private serviceFactories: Map<keyof Services, ServiceFactory<any>> = new Map();
    private commandFactories: Map<keyof Commands, CommandFactory<any>> = new Map();
    
    private isInitialized = false;
    private initTime: number = 0;

    constructor(config: AppConfig) {
        this.config = config;
        this.registerServiceFactories();
        this.registerCommandFactories();
    }

    /**
     * Registra todas as factories de serviços
     */
    private registerServiceFactories(): void {
        // Serviços base (sem dependências)
        this.serviceFactories.set("projectService", () => 
            new ProjectService(this.config.project)
        );
        
        this.serviceFactories.set("buildCacheService", () => 
            new BuildCacheService()
        );
        
        this.serviceFactories.set("historyService", () => 
            new HistoryService()
        );
        
        // Serviços com dependências
        this.serviceFactories.set("dashboardService", () => {
            const service = new DashboardService(this.config);
            // Configura Logger com dashboard
            Logger.setDashboard(service);
            return service;
        });
        
        this.serviceFactories.set("logAnalyzer", () => 
            new LogAnalyzer(this.config.project)
        );
        
        this.serviceFactories.set("tomcatService", () => {
            const service = new TomcatService(this.config.tomcat);
            // Lazy injeção de projectService
            const projectService = this.getService("projectService");
            service.setProjectService(projectService);
            return service;
        });
        
        this.serviceFactories.set("buildService", () => {
            const projectService = this.getService("projectService");
            const buildCacheService = this.getService("buildCacheService");
            return new BuildService(
                this.config.project,
                this.config.tomcat,
                projectService,
                buildCacheService
            );
        });
        
        this.serviceFactories.set("auditService", () => 
            new AuditService(this.config.tomcat)
        );
    }

    /**
     * Registra todas as factories de comandos
     */
    private registerCommandFactories(): void {
        this.commandFactories.set("deploy", (s) => 
            new DeployCommand(s.tomcatService, s.buildService)
        );
        
        this.commandFactories.set("dev", (s) => 
            new DeployCommand(s.tomcatService, s.buildService)
        );
        
        this.commandFactories.set("build", (s) => 
            new BuildCommand(s.buildService)
        );
        
        this.commandFactories.set("start", (s) => 
            new StartCommand(s.tomcatService)
        );
        
        this.commandFactories.set("logs", (s) => 
            new LogsCommand(s.dashboardService, s.logAnalyzer)
        );
        
        this.commandFactories.set("audit", (s) => 
            new AuditCommand(s.auditService)
        );
        
        this.commandFactories.set("profiles", (s) => 
            new ProfilesCommand(s.projectService)
        );
        
        this.commandFactories.set("run", (s) => 
            new RunCommand(s.buildService)
        );
        
        this.commandFactories.set("debug", (s) => 
            new RunCommand(s.buildService)
        );
        
        this.commandFactories.set("help", () => new HelpCommand());
        this.commandFactories.set("doctor", () => new DoctorCommand());
        this.commandFactories.set("deps", () => new DepsCommand());
        this.commandFactories.set("tomcat", () => new TomcatCommand());
        this.commandFactories.set("encoding", () => new EncodingCommand());
        this.commandFactories.set("docs", () => new DocsCommand());
        this.commandFactories.set("init", () => new InitCommand());
        this.commandFactories.set("config", () => new ConfigCommand());
        this.commandFactories.set("history", () => new HistoryCommand());
        this.commandFactories.set("redo", () => new RedoCommand());
        this.commandFactories.set("health", () => new HealthCommand());
        this.commandFactories.set("completion", () => new CompletionCommand());
        this.commandFactories.set("changelog", () => new ChangelogCommand());
        this.commandFactories.set("test", () => new TestCommand());
        this.commandFactories.set("db", () => new DbCommand());
        this.commandFactories.set("http", () => new HttpCommand());
        this.commandFactories.set("docker", () => new DockerCommand());
        this.commandFactories.set("clean", () => new CleanCommand());
        this.commandFactories.set("ide", () => new IdeCommand());
    }

    /**
     * Inicialização rápida - só cria serviços essenciais
     */
    initialize(): void {
        if (this.isInitialized) {
            Logger.debug("DI Container já inicializado");
            return;
        }

        const startTime = performance.now();
        
        // Só inicializa serviços essenciais
        this.initEssentialServices();
        
        this.initTime = performance.now() - startTime;
        this.isInitialized = true;
        
        Logger.debug(`DI Container inicializado em ${this.initTime.toFixed(2)}ms`);
    }

    /**
     * Inicializa apenas serviços essenciais
     */
    private initEssentialServices(): void {
        // ProjectService é essencial (usado por muitos outros serviços)
        this.getService("projectService");
    }

    /**
     * Obtém um serviço (lazy load com cache)
     */
    getService<K extends keyof Services>(name: K): Services[K] {
        // Retorna do cache se já existe
        if (this.serviceCache[name]) {
            return this.serviceCache[name]!;
        }

        // Cria via factory
        const factory = this.serviceFactories.get(name);
        if (!factory) {
            throw new Error(`Serviço '${name}' não encontrado no container`);
        }

        const instance = factory();
        this.serviceCache[name] = instance;
        return instance;
    }

    /**
     * Obtém um comando (lazy load com cache)
     */
    getCommand<K extends keyof Commands>(name: K): Commands[K] {
        // Retorna do cache se já existe
        if (this.commandCache[name]) {
            return this.commandCache[name]!;
        }

        // Cria via factory
        const factory = this.commandFactories.get(name);
        if (!factory) {
            throw new Error(`Comando '${name}' não encontrado no container`);
        }

        // Garante que serviços necessários estão disponíveis
        const services = this.getAllServices();
        const instance = factory(services);
        this.commandCache[name] = instance;
        return instance;
    }

    /**
     * Obtém todos os serviços (cria todos)
     */
    getAllServices(): Services {
        // Força criação de todos os serviços
        const serviceNames = Array.from(this.serviceFactories.keys()) as Array<keyof Services>;
        for (const name of serviceNames) {
            this.getService(name);
        }
        return this.serviceCache as Services;
    }

    /**
     * Obtém todos os comandos (cria todos)
     */
    getAllCommands(): Commands {
        // Força criação de todos os comandos
        const commandNames = Array.from(this.commandFactories.keys()) as Array<keyof Commands>;
        for (const name of commandNames) {
            this.getCommand(name);
        }
        return this.commandCache as Commands;
    }

    /**
     * Verifica se um serviço está carregado
     */
    isServiceLoaded<K extends keyof Services>(name: K): boolean {
        return name in this.serviceCache;
    }

    /**
     * Lista serviços carregados
     */
    getLoadedServices(): Array<keyof Services> {
        return Object.keys(this.serviceCache) as Array<keyof Services>;
    }

    /**
     * Registra um serviço customizado (útil para testes)
     */
    registerService<K extends keyof Services>(name: K, service: Services[K]): void {
        this.serviceCache[name] = service;
    }

    /**
     * Registra um comando customizado (útil para testes)
     */
    registerCommand<K extends keyof Commands>(name: K, command: Commands[K]): void {
        this.commandCache[name] = command;
    }

    /**
     * Limpa todos os caches (útil para testes)
     */
    reset(): void {
        this.serviceCache = {};
        this.commandCache = {};
        this.isInitialized = false;
    }

    /**
     * Obtém estatísticas do container
     */
    getStats(): { 
        initialized: boolean; 
        initTime: number; 
        loadedServices: number; 
        loadedCommands: number;
        totalServices: number;
        totalCommands: number;
    } {
        return {
            initialized: this.isInitialized,
            initTime: this.initTime,
            loadedServices: Object.keys(this.serviceCache).length,
            loadedCommands: Object.keys(this.commandCache).length,
            totalServices: this.serviceFactories.size,
            totalCommands: this.commandFactories.size,
        };
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
