/**
 * Schemas de validação Zod para configurações do XAVVA CLI
 * Garante type safety e validação em runtime
 */

import { z } from "zod";

// ============================================
// SCHEMAS BASE
// ============================================

export const TomcatConfigSchema = z.object({
    path: z.string().min(1, "Tomcat path é obrigatório"),
    port: z.number().int().min(1).max(65535).default(8080),
    webapps: z.string().default("webapps"),
    grep: z.string().default(""),
    embedded: z.boolean().default(false),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "Versão deve seguir formato semver").default("10.1.52"),
});

export const SpringBootConfigSchema = z.object({
    mainClass: z.string().default(""),
    args: z.string().default(""),
    profile: z.string().default(""),
});

export const ProjectConfigSchema = z.object({
    appName: z.string().default(""),
    buildTool: z.enum(["maven", "gradle"]).default("maven"),
    profile: z.string().default(""),
    executionMode: z.enum(["springboot", "embedded", "external", "war"]).default("embedded"),
    skipBuild: z.boolean().default(false),
    skipScan: z.boolean().default(true),
    clean: z.boolean().default(false),
    cleanLogs: z.boolean().default(true),
    quiet: z.boolean().default(true),
    verbose: z.boolean().default(false),
    debug: z.boolean().default(false),
    debugPort: z.number().int().min(1).max(65535).default(5005),
    grep: z.string().default(""),
    tui: z.boolean().default(false),
    encoding: z.string().default(""),
    war: z.boolean().default(false),
    cache: z.boolean().default(false),
    hotReload: z.boolean().default(true),
    environment: z.string().default(""),
    environments: z.record(z.any()).optional(),
    springBoot: SpringBootConfigSchema.optional(),
});

export const AppConfigSchema = z.object({
    tomcat: TomcatConfigSchema,
    project: ProjectConfigSchema,
});

// ============================================
// SCHEMAS DE CLI ARGS
// ============================================

export const BaseArgsSchema = z.object({
    help: z.boolean().optional(),
    version: z.boolean().optional(),
    verbose: z.boolean().optional(),
    quiet: z.boolean().optional(),
    "debug-level": z.enum(["silent", "error", "warn", "info", "verbose", "trace", "silly"]).optional(),
});

export const ProjectArgsSchema = z.object({
    tool: z.enum(["maven", "gradle"]).optional(),
    name: z.string().optional(),
    profile: z.string().optional(),
    encoding: z.string().optional(),
    "no-build": z.boolean().optional(),
    clean: z.boolean().optional(),
    war: z.boolean().optional(),
    cache: z.boolean().optional(),
});

export const TomcatArgsSchema = z.object({
    path: z.string().optional(),
    port: z.string().optional(),
    "tomcat-version": z.string().optional(),
    yes: z.boolean().optional(),
});

export const DebugArgsSchema = z.object({
    debug: z.boolean().optional(),
    watch: z.boolean().optional(),
    tui: z.boolean().optional(),
    dp: z.string().optional(),
});

// ============================================
// TIPOS INFERIDOS
// ============================================

export type ValidatedTomcatConfig = z.infer<typeof TomcatConfigSchema>;
export type ValidatedProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ValidatedAppConfig = z.infer<typeof AppConfigSchema>;
export type ValidatedSpringBootConfig = z.infer<typeof SpringBootConfigSchema>;

// ============================================
// FUNÇÕES DE VALIDAÇÃO
// ============================================

/**
 * Valida configuração completa do aplicativo
 */
export function validateAppConfig(config: unknown): ValidatedAppConfig {
    if (!config || typeof config !== 'object') {
        throw new Error("Configuração deve ser um objeto");
    }
    
    const result = AppConfigSchema.safeParse(config);
    
    if (!result.success) {
        const issues = result.error?.issues || result.error?.errors || [];
        const formattedErrors = issues.map((e: any) => 
            `${e.path?.join('.') || 'root'}: ${e.message}`
        ).join('\n');
        
        throw new Error(`Configuração inválida:\n${formattedErrors || result.error?.message || 'Erro desconhecido'}`);
    }
    
    return result.data;
}

/**
 * Valida config parcial (para merges)
 */
export function validatePartialConfig(config: unknown): Partial<ValidatedAppConfig> {
    const result = AppConfigSchema.partial().safeParse(config);
    
    if (!result.success) {
        const formattedErrors = result.error.errors.map(e => 
            `${e.path.join('.')}: ${e.message}`
        ).join('\n');
        
        throw new Error(`Configuração parcial inválida:\n${formattedErrors}`);
    }
    
    return result.data;
}

/**
 * Valida porta (helper)
 */
export function validatePort(port: string | number): number {
    const num = typeof port === 'string' ? parseInt(port, 10) : port;
    
    if (isNaN(num) || num < 1 || num > 65535) {
        throw new Error(`Porta inválida: ${port}. Deve ser entre 1 e 65535.`);
    }
    
    return num;
}

/**
 * Valida versão do Tomcat
 */
export function validateTomcatVersion(version: string): string {
    const semverRegex = /^\d+\.\d+\.\d+$/;
    
    if (!semverRegex.test(version)) {
        throw new Error(`Versão do Tomcat inválida: ${version}. Formato esperado: x.x.x (ex: 10.1.52)`);
    }
    
    return version;
}

/**
 * Merge seguro de configurações
 */
export function mergeConfigs(
    base: Partial<ValidatedAppConfig>,
    override: Partial<ValidatedAppConfig>
): ValidatedAppConfig {
    const merged = {
        tomcat: { ...base.tomcat, ...override.tomcat },
        project: { ...base.project, ...override.project },
    };
    
    return validateAppConfig(merged);
}
