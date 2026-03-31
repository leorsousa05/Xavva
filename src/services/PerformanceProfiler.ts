/**
 * Profiler de Performance
 * 
 * Mede tempo de execução de operações e gera relatórios
 * Uso: xavva build --profile ou xavva deploy --profile
 */

import { Logger } from "../logging";

interface PhaseTiming {
    phase: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    parent?: string;
}

interface ProfilerConfig {
    enabled: boolean;
    verbose: boolean;
}

export class PerformanceProfiler {
    private timings: Map<string, PhaseTiming> = new Map();
    private completedTimings: PhaseTiming[] = [];
    private stack: string[] = [];
    private config: ProfilerConfig;
    private logger = Logger.getInstance();
    private globalStart: number = 0;

    constructor(config: Partial<ProfilerConfig> = {}) {
        this.config = {
            enabled: true,
            verbose: false,
            ...config,
        };
    }

    /**
     * Inicia profiling global
     */
    start(): void {
        if (!this.config.enabled) return;
        this.globalStart = performance.now();
        this.timings.clear();
        this.completedTimings = [];
        this.stack = [];
    }

    /**
     * Inicia uma fase
     */
    startPhase(phase: string): void {
        if (!this.config.enabled) return;

        const parent = this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
        
        const timing: PhaseTiming = {
            phase,
            startTime: performance.now(),
            parent,
        };

        this.timings.set(phase, timing);
        this.stack.push(phase);

        if (this.config.verbose) {
            this.logger.debug(`[Profiler] Iniciando: ${phase}`);
        }
    }

    /**
     * Finaliza uma fase
     */
    endPhase(phase?: string): void {
        if (!this.config.enabled) return;

        const phaseName = phase || this.stack.pop();
        if (!phaseName) return;

        const timing = this.timings.get(phaseName);
        if (!timing) return;

        timing.endTime = performance.now();
        timing.duration = timing.endTime - timing.startTime;

        this.completedTimings.push({ ...timing });
        this.timings.delete(phaseName);

        if (this.config.verbose) {
            this.logger.debug(`[Profiler] Finalizado: ${phaseName} (${timing.duration.toFixed(2)}ms)`);
        }
    }

    /**
     * Executa função dentro de uma fase
     */
    async withPhase<T>(phase: string, fn: () => Promise<T>): Promise<T> {
        this.startPhase(phase);
        try {
            return await fn();
        } finally {
            this.endPhase(phase);
        }
    }

    /**
     * Executa função síncrona dentro de uma fase
     */
    withPhaseSync<T>(phase: string, fn: () => T): T {
        this.startPhase(phase);
        try {
            return fn();
        } finally {
            this.endPhase(phase);
        }
    }

    /**
     * Gera relatório de performance
     */
    generateReport(): void {
        if (!this.config.enabled) return;

        const totalTime = performance.now() - this.globalStart;

        this.logger.newline();
        this.logger.section("📊 Profile de Performance");

        // Ordena por duração (decrescente)
        const sorted = [...this.completedTimings].sort((a, b) => 
            (b.duration || 0) - (a.duration || 0)
        );

        // Agrupa por nível
        const rootPhases = sorted.filter(t => !t.parent);
        
        for (const phase of rootPhases) {
            this.printPhase(phase, sorted, 0, totalTime);
        }

        // Linha de total
        this.logger.divider();
        this.printTimingLine("TOTAL", totalTime, totalTime, 0, true);

        // Estatísticas
        this.printStats();
    }

    private printPhase(phase: PhaseTiming, all: PhaseTiming[], level: number, total: number): void {
        this.printTimingLine(phase.phase, phase.duration || 0, total, level);

        // Filhos
        const children = all.filter(t => t.parent === phase.phase);
        for (const child of children) {
            this.printPhase(child, all, level + 1, total);
        }
    }

    private printTimingLine(name: string, duration: number, total: number, level: number, isTotal = false): void {
        const indent = "  ".repeat(level);
        const percent = total > 0 ? (duration / total) * 100 : 0;
        const bar = this.renderBar(percent);
        
        const timeStr = this.formatDuration(duration);
        const percentStr = percent.toFixed(1).padStart(5);
        
        const nameFormatted = isTotal 
            ? `${name}`
            : `${indent}${name}`;
        
        this.logger.info(`${nameFormatted.padEnd(25)} ${timeStr.padStart(10)} ${bar} ${percentStr}%`);
    }

    private renderBar(percent: number): string {
        const width = 20;
        const filled = Math.round((percent / 100) * width);
        const empty = width - filled;
        
        const bar = "█".repeat(filled) + "░".repeat(empty);
        return `[${bar}]`;
    }

    private formatDuration(ms: number): string {
        if (ms < 1000) {
            return `${ms.toFixed(0)}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(2)}s`;
        } else {
            const mins = Math.floor(ms / 60000);
            const secs = ((ms % 60000) / 1000).toFixed(1);
            return `${mins}m ${secs}s`;
        }
    }

    private printStats(): void {
        const times = this.completedTimings.map(t => t.duration || 0);
        
        if (times.length === 0) return;

        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const max = Math.max(...times);
        const min = Math.min(...times);

        this.logger.newline();
        this.logger.info("📈 Estatísticas:");
        this.logger.info(`   Fases: ${times.length}`);
        this.logger.info(`   Média: ${this.formatDuration(avg)}`);
        this.logger.info(`   Mín: ${this.formatDuration(min)}`);
        this.logger.info(`   Máx: ${this.formatDuration(max)}`);
    }

    /**
     * Exporta dados para JSON
     */
    exportJSON(): object {
        const totalTime = performance.now() - this.globalStart;
        
        return {
            totalTime,
            phases: this.completedTimings.map(t => ({
                phase: t.phase,
                duration: t.duration,
                parent: t.parent,
            })),
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Limpa dados
     */
    reset(): void {
        this.timings.clear();
        this.completedTimings = [];
        this.stack = [];
        this.globalStart = 0;
    }

    /**
     * Verifica se profiling está ativo
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * Ativa/desativa profiling
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
    }
}

// Singleton global
let globalProfiler: PerformanceProfiler | null = null;

export function getProfiler(config?: Partial<ProfilerConfig>): PerformanceProfiler {
    if (!globalProfiler) {
        globalProfiler = new PerformanceProfiler(config);
    }
    return globalProfiler;
}

export function resetProfiler(): void {
    globalProfiler = null;
}
