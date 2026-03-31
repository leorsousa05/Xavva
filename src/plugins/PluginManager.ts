/**
 * Gerenciador de Plugins do XAVVA CLI
 * 
 * Responsável por:
 * - Carregar plugins de npm ou caminhos locais
 * - Executar hooks em pontos específicos
 * - Gerenciar comandos de plugins
 */

import path from "path";
import { existsSync } from "fs";
import { mkdir, writeFile, readFile } from "fs/promises";
import os from "os";
import type { AppConfig } from "../types/config";
import { Logger } from "../logging";
import type { 
    XavvaPlugin, 
    LoadedPlugin, 
    PluginConfig,
    BuildContext,
    DeployContext,
    TestContext,
} from "./types";

export class PluginManager {
    private plugins: LoadedPlugin[] = [];
    private logger = Logger.getInstance();
    private pluginsDir: string;
    private config: AppConfig;

    constructor(config: AppConfig) {
        this.config = config;
        this.pluginsDir = path.join(os.homedir(), ".xavva", "plugins");
    }

    /**
     * Carrega todos os plugins configurados
     */
    async loadPlugins(): Promise<void> {
        const pluginConfigs = this.config.project.plugins as PluginConfig[] || [];
        
        if (pluginConfigs.length === 0) {
            this.logger.debug("Nenhum plugin configurado");
            return;
        }

        this.logger.section(`Carregando ${pluginConfigs.length} plugin(s)`);

        for (const pluginConfig of pluginConfigs) {
            try {
                await this.loadPlugin(pluginConfig);
            } catch (error) {
                this.logger.error(`Falha ao carregar plugin ${pluginConfig.name}: ${(error as Error).message}`);
            }
        }

        this.logger.success(`${this.plugins.length} plugin(s) carregado(s)`);
    }

    /**
     * Carrega um plugin específico
     */
    private async loadPlugin(config: PluginConfig): Promise<void> {
        const { name, path: pluginPath, config: pluginConfigData } = config;

        this.logger.step(`Carregando: ${name}`);

        // Resolve caminho do plugin
        const resolvedPath = this.resolvePluginPath(name, pluginPath);
        
        // Importa plugin
        const pluginModule = await import(resolvedPath);
        const plugin: XavvaPlugin = pluginModule.default || pluginModule;

        // Valida plugin
        this.validatePlugin(plugin);

        // Inicializa se necessário
        if (plugin.initialize) {
            await plugin.initialize(this.config);
        }

        // Registra plugin
        this.plugins.push({
            plugin,
            path: resolvedPath,
            config: pluginConfigData,
        });

        this.logger.info(`  ✓ ${plugin.name} v${plugin.version}`);
        if (plugin.description) {
            this.logger.info(`    ${plugin.description}`);
        }
    }

    /**
     * Resolve caminho do plugin
     */
    private resolvePluginPath(name: string, customPath?: string): string {
        // Caminho customizado tem prioridade
        if (customPath) {
            if (customPath.startsWith("./") || customPath.startsWith("../")) {
                return path.resolve(process.cwd(), customPath);
            }
            return customPath;
        }

        // Tenta carregar de node_modules
        const npmPath = path.join(process.cwd(), "node_modules", name);
        if (existsSync(npmPath)) {
            return npmPath;
        }

        // Tenta carregar do diretório de plugins do Xavva
        const xavvaPluginPath = path.join(this.pluginsDir, name);
        if (existsSync(xavvaPluginPath)) {
            return xavvaPluginPath;
        }

        // Tenta carregar como caminho relativo
        const relativePath = path.join(process.cwd(), name);
        if (existsSync(relativePath)) {
            return relativePath;
        }

        throw new Error(`Plugin não encontrado: ${name}`);
    }

    /**
     * Valida estrutura do plugin
     */
    private validatePlugin(plugin: XavvaPlugin): void {
        if (!plugin.name) {
            throw new Error("Plugin deve ter um nome");
        }
        
        if (!plugin.version) {
            throw new Error("Plugin deve ter uma versão");
        }
    }

    /**
     * Executa hook beforeBuild em todos os plugins
     */
    async executeBeforeBuild(context: BuildContext): Promise<void> {
        for (const { plugin } of this.plugins) {
            if (plugin.hooks?.beforeBuild) {
                try {
                    await plugin.hooks.beforeBuild(context);
                } catch (error) {
                    this.logger.warn(`Plugin ${plugin.name} falhou em beforeBuild: ${(error as Error).message}`);
                }
            }
        }
    }

    /**
     * Executa hook afterBuild em todos os plugins
     */
    async executeAfterBuild(context: BuildContext, success: boolean): Promise<void> {
        for (const { plugin } of this.plugins) {
            if (plugin.hooks?.afterBuild) {
                try {
                    await plugin.hooks.afterBuild(context, success);
                } catch (error) {
                    this.logger.warn(`Plugin ${plugin.name} falhou em afterBuild: ${(error as Error).message}`);
                }
            }
        }
    }

    /**
     * Executa hook beforeDeploy em todos os plugins
     */
    async executeBeforeDeploy(context: DeployContext): Promise<void> {
        for (const { plugin } of this.plugins) {
            if (plugin.hooks?.beforeDeploy) {
                try {
                    await plugin.hooks.beforeDeploy(context);
                } catch (error) {
                    this.logger.warn(`Plugin ${plugin.name} falhou em beforeDeploy: ${(error as Error).message}`);
                }
            }
        }
    }

    /**
     * Executa hook afterDeploy em todos os plugins
     */
    async executeAfterDeploy(context: DeployContext, success: boolean): Promise<void> {
        for (const { plugin } of this.plugins) {
            if (plugin.hooks?.afterDeploy) {
                try {
                    await plugin.hooks.afterDeploy(context, success);
                } catch (error) {
                    this.logger.warn(`Plugin ${plugin.name} falhou em afterDeploy: ${(error as Error).message}`);
                }
            }
        }
    }

    /**
     * Executa hook beforeTest em todos os plugins
     */
    async executeBeforeTest(context: TestContext): Promise<void> {
        for (const { plugin } of this.plugins) {
            if (plugin.hooks?.beforeTest) {
                try {
                    await plugin.hooks.beforeTest(context);
                } catch (error) {
                    this.logger.warn(`Plugin ${plugin.name} falhou em beforeTest: ${(error as Error).message}`);
                }
            }
        }
    }

    /**
     * Executa hook afterTest em todos os plugins
     */
    async executeAfterTest(context: TestContext, success: boolean): Promise<void> {
        for (const { plugin } of this.plugins) {
            if (plugin.hooks?.afterTest) {
                try {
                    await plugin.hooks.afterTest(context, success);
                } catch (error) {
                    this.logger.warn(`Plugin ${plugin.name} falhou em afterTest: ${(error as Error).message}`);
                }
            }
        }
    }

    /**
     * Obtém comandos de todos os plugins
     */
    getPluginCommands(): Map<string, import("../commands/Command").Command> {
        const commands = new Map<string, import("../commands/Command").Command>();
        
        for (const { plugin } of this.plugins) {
            if (plugin.commands) {
                for (const command of plugin.commands) {
                    // Assume que comando tem nome ou usa classe
                    const name = (command as any).name || command.constructor.name.toLowerCase();
                    commands.set(name, command);
                }
            }
        }
        
        return commands;
    }

    /**
     * Lista plugins carregados
     */
    listPlugins(): Array<{ name: string; version: string; description?: string }> {
        return this.plugins.map(({ plugin }) => ({
            name: plugin.name,
            version: plugin.version,
            description: plugin.description,
        }));
    }

    /**
     * Destrói todos os plugins
     */
    async destroy(): Promise<void> {
        for (const { plugin } of this.plugins) {
            if (plugin.destroy) {
                try {
                    await plugin.destroy();
                } catch (error) {
                    this.logger.warn(`Erro ao destruir plugin ${plugin.name}: ${(error as Error).message}`);
                }
            }
        }
        this.plugins = [];
    }

    /**
     * Instala plugin via npm
     */
    async installPlugin(name: string): Promise<void> {
        this.logger.step(`Instalando plugin: ${name}`);
        
        // Cria diretório se não existe
        await mkdir(this.pluginsDir, { recursive: true });

        // Executa npm install
        const proc = Bun.spawn([
            "npm", "install", name, "--prefix", this.pluginsDir, "--no-save"
        ], {
            stdout: "pipe",
            stderr: "pipe",
        });

        const exitCode = await proc.exited;
        
        if (exitCode !== 0) {
            const error = await new Response(proc.stderr).text();
            throw new Error(`npm install falhou: ${error}`);
        }

        this.logger.success(`Plugin ${name} instalado`);
    }

    /**
     * Remove plugin
     */
    async uninstallPlugin(name: string): Promise<void> {
        this.logger.step(`Removendo plugin: ${name}`);
        
        const proc = Bun.spawn([
            "npm", "uninstall", name, "--prefix", this.pluginsDir
        ], {
            stdout: "pipe",
            stderr: "pipe",
        });

        await proc.exited;
        
        // Remove da lista de plugins carregados
        this.plugins = this.plugins.filter(p => p.plugin.name !== name);
        
        this.logger.success(`Plugin ${name} removido`);
    }
}
