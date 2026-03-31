/**
 * Tipos para o Sistema de Plugins do XAVVA CLI
 */

import type { Command } from "../commands/Command";
import type { AppConfig } from "../types/config";
import type { z } from "zod";

// Contextos de hooks
export interface BuildContext {
    config: AppConfig;
    incremental: boolean;
    changedFiles?: string[];
}

export interface DeployContext {
    config: AppConfig;
    targetPath: string;
}

export interface TestContext {
    config: AppConfig;
    filter?: string;
    coverage: boolean;
}

// Hook handlers
export type BeforeBuildHook = (context: BuildContext) => Promise<void> | void;
export type AfterBuildHook = (context: BuildContext, success: boolean) => Promise<void> | void;
export type BeforeDeployHook = (context: DeployContext) => Promise<void> | void;
export type AfterDeployHook = (context: DeployContext, success: boolean) => Promise<void> | void;
export type BeforeTestHook = (context: TestContext) => Promise<void> | void;
export type AfterTestHook = (context: TestContext, success: boolean) => Promise<void> | void;

// Interface do plugin
export interface XavvaPlugin {
    /** Nome único do plugin */
    name: string;
    
    /** Versão do plugin (semver) */
    version: string;
    
    /** Descrição */
    description?: string;
    
    /** Comandos adicionados pelo plugin */
    commands?: Command[];
    
    /** Hooks */
    hooks?: {
        beforeBuild?: BeforeBuildHook;
        afterBuild?: AfterBuildHook;
        beforeDeploy?: BeforeDeployHook;
        afterDeploy?: AfterDeployHook;
        beforeTest?: BeforeTestHook;
        afterTest?: AfterTestHook;
    };
    
    /** Schema de configuração estendida */
    configSchema?: z.ZodSchema;
    
    /** Inicialização do plugin */
    initialize?(config: AppConfig): Promise<void> | void;
    
    /** Cleanup ao finalizar */
    destroy?(): Promise<void> | void;
}

// Metadados de plugin carregado
export interface LoadedPlugin {
    plugin: XavvaPlugin;
    path: string;
    config?: Record<string, unknown>;
}

// Configuração de plugin no xavva.json
export interface PluginConfig {
    name: string;
    version?: string;
    path?: string;
    config?: Record<string, unknown>;
}
