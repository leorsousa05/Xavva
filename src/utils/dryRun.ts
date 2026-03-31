/**
 * Utilitários para modo Dry-Run (simulação)
 * 
 * Permite visualizar o que seria executado sem realmente executar
 */

import { Logger } from "../logging";

export interface DryRunAction {
    type: "command" | "file" | "network" | "config" | "warning";
    description: string;
    details?: string[];
}

export class DryRunSimulator {
    private actions: DryRunAction[] = [];
    private logger = Logger.getInstance();

    /**
     * Registra uma ação que seria executada
     */
    addCommand(command: string, args: string[] = []): void {
        this.actions.push({
            type: "command",
            description: `Executar: ${command} ${args.join(" ")}`,
            details: [`Comando: ${command}`, `Args: ${args.join(" ") || "(nenhum)"}`],
        });
    }

    /**
     * Registra uma operação de arquivo
     */
    addFileOperation(operation: "copy" | "move" | "delete" | "create", from: string, to?: string): void {
        const descriptions: Record<string, string> = {
            copy: `Copiar: ${from} → ${to}`,
            move: `Mover: ${from} → ${to}`,
            delete: `Excluir: ${from}`,
            create: `Criar: ${from}`,
        };

        this.actions.push({
            type: "file",
            description: descriptions[operation],
            details: [from, to].filter(Boolean),
        });
    }

    /**
     * Registra uma requisição de rede
     */
    addNetworkRequest(method: string, url: string, body?: string): void {
        this.actions.push({
            type: "network",
            description: `${method.toUpperCase()} ${url}`,
            details: body ? [`Body: ${body}`] : undefined,
        });
    }

    /**
     * Registra uma mudança de configuração
     */
    addConfigChange(key: string, oldValue: string, newValue: string): void {
        this.actions.push({
            type: "config",
            description: `Config: ${key} = ${newValue}`,
            details: [`Anterior: ${oldValue}`, `Novo: ${newValue}`],
        });
    }

    /**
     * Adiciona um aviso
     */
    addWarning(message: string): void {
        this.actions.push({
            type: "warning",
            description: `⚠️  ${message}`,
        });
    }

    /**
     * Mostra o relatório de simulação
     */
    printReport(): void {
        this.logger.section("Modo Dry-Run (Simulação)");
        this.logger.info("Nenhuma alteração será feita. Ações que seriam executadas:");
        this.logger.newline();

        // Agrupa por tipo
        const byType: Record<string, DryRunAction[]> = {};
        for (const action of this.actions) {
            if (!byType[action.type]) byType[action.type] = [];
            byType[action.type].push(action);
        }

        // Mostra comandos
        if (byType["command"]) {
            this.logger.info("📋 Comandos:");
            for (const action of byType["command"]) {
                this.logger.info(`   $ ${action.description}`);
            }
            this.logger.newline();
        }

        // Mostra operações de arquivo
        if (byType["file"]) {
            this.logger.info("📁 Arquivos:");
            for (const action of byType["file"]) {
                this.logger.info(`   ${action.description}`);
            }
            this.logger.newline();
        }

        // Mostra requisições de rede
        if (byType["network"]) {
            this.logger.info("🌐 Rede:");
            for (const action of byType["network"]) {
                this.logger.info(`   ${action.description}`);
            }
            this.logger.newline();
        }

        // Mostra mudanças de config
        if (byType["config"]) {
            this.logger.info("⚙️  Configurações:");
            for (const action of byType["config"]) {
                this.logger.info(`   ${action.description}`);
                if (action.details) {
                    for (const detail of action.details) {
                        this.logger.info(`      ${detail}`);
                    }
                }
            }
            this.logger.newline();
        }

        // Mostra avisos
        if (byType["warning"]) {
            this.logger.warn("⚠️  Avisos:");
            for (const action of byType["warning"]) {
                this.logger.warn(`   ${action.description}`);
            }
            this.logger.newline();
        }

        this.logger.divider();
        this.logger.info(`Total de ações: ${this.actions.length}`);
    }

    /**
     * Limpa as ações registradas
     */
    clear(): void {
        this.actions = [];
    }

    /**
     * Retorna todas as ações
     */
    getActions(): DryRunAction[] {
        return [...this.actions];
    }
}

// Singleton global
let globalSimulator: DryRunSimulator | null = null;

export function getDryRunSimulator(): DryRunSimulator {
    if (!globalSimulator) {
        globalSimulator = new DryRunSimulator();
    }
    return globalSimulator;
}

export function resetDryRunSimulator(): void {
    globalSimulator = null;
}

/**
 * Wrapper para executar função em modo dry-run ou real
 */
export async function withDryRun<T>(
    isDryRun: boolean,
    fn: () => Promise<T>,
    simulator?: DryRunSimulator
): Promise<T | void> {
    if (isDryRun) {
        const sim = simulator || getDryRunSimulator();
        sim.printReport();
        return;
    }
    return fn();
}
