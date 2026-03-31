/**
 * ProgressBar - Adaptador para o novo sistema de logging
 * 
 * @deprecated Use ProgressLogger de src/logging/
 */

import { Logger, ProgressLogger, Colors } from "../logging";

export interface ProgressBarOptions {
    title: string;
    total: number;
    width?: number;
    showPercentage?: boolean;
    showEta?: boolean;
    showSpeed?: boolean;
}

/**
 * @deprecated Use ProgressLogger de src/logging/
 */
export class ProgressBar {
    private current = 0;
    private startTime: number;
    private options: Required<ProgressBarOptions>;
    private isComplete = false;
    private logger: ProgressLogger;

    constructor(options: ProgressBarOptions) {
        this.options = {
            width: 30,
            showPercentage: true,
            showEta: true,
            ...options
        };
        this.startTime = Date.now();
        
        // Cria um ProgressLogger interno
        this.logger = new ProgressLogger(options.title, {
            total: options.total,
            width: this.options.width,
            showPercentage: this.options.showPercentage,
            showEta: this.options.showEta,
        });
    }

    update(current: number, speed?: number, eta?: number): void {
        if (this.isComplete) return;
        this.current = Math.min(current, this.options.total);
        
        // Atualiza o ProgressLogger interno com extras se disponíveis
        if (speed !== undefined && eta !== undefined) {
            // Cria string de extras
            const extras: string[] = [];
            if (this.options.showSpeed && speed > 0) {
                extras.push(`${speed.toFixed(1)} MB/s`);
            }
            if (this.options.showEta && eta > 0) {
                const etaSec = Math.ceil(eta);
                if (etaSec < 60) {
                    extras.push(`${etaSec}s restantes`);
                } else {
                    extras.push(`${Math.ceil(etaSec / 60)}min restantes`);
                }
            }
            
            // Renderiza com extras
            this.renderWithExtras(extras);
        } else {
            this.logger.update(this.current);
        }
    }

    private renderWithExtras(extras: string[]): void {
        // Acessa o método privado via cast para atualizar com extras
        const percentage = Math.floor((this.current / this.options.total) * 100);
        const filled = Math.floor((this.current / this.options.total) * this.options.width);
        const empty = this.options.width - filled;
        
        const bar = "█".repeat(filled) + "░".repeat(empty);
        const extraStr = extras.length > 0 ? ` | ${extras.join(" | ")}` : "";
        
        process.stdout.clearLine?.(0);
        process.stdout.cursorTo?.(0);
        process.stdout.write(`  ${this.options.title}: [${bar}] ${percentage}%${extraStr}`);
    }

    increment(amount = 1): void {
        this.update(this.current + amount);
    }

    complete(): void {
        if (this.isComplete) return;
        this.current = this.options.total;
        this.isComplete = true;
        
        // Limpa linha e mostra completo
        process.stdout.clearLine?.(0);
        process.stdout.cursorTo?.(0);
        
        this.logger.complete();
    }

    private render(): void {
        // Delegado para o ProgressLogger
        this.logger.update(this.current);
    }
}

/**
 * @deprecated Use ProgressLogger de src/logging/
 */
export class ThemedSpinner {
    private static frames = {
        default: ["|", "/", "-", "\\"],
        dots: [".", "..", "...", "....", ".....", "....", "...", ".."],
        line: ["-", "\\", "|", "/"],
        arrow: [">", "->", "-->", "--->", "---->", "--->", "-->", "->"],
        pulse: ["#", "##", "###", "####", "#####", "####", "###", "##"],
        moon: ["(", "(-", "(-(", "(-(-", "(-(-(", "(-(-", "(-(", "(-"]
    };

    private static colors = {
        default: Colors.primary,
        build: Colors.warning,
        download: Colors.info,
        deploy: Colors.success,
        watch: Colors.secondary
    };

    private timer?: Timer;
    private frameIndex = 0;

    start(
        message: string, 
        theme: keyof typeof ThemedSpinner.frames = "default",
        color: keyof typeof ThemedSpinner.colors = "default"
    ): { stop: (success?: boolean) => void } {
        const frames = ThemedSpinner.frames[theme];
        const colorCode = ThemedSpinner.colors[color];

        process.stdout.write(`${Colors.gray}│${Colors.reset}  `);
        process.stdout.write("\x1B[?25l");

        this.timer = setInterval(() => {
            const frame = frames[this.frameIndex];
            process.stdout.write(`\r${Colors.gray}│${Colors.reset}  ${colorCode}${frame}${Colors.reset} ${Colors.dim}${message}${Colors.reset}`);
            this.frameIndex = (this.frameIndex + 1) % frames.length;
        }, 80);

        return {
            stop: (success = true) => {
                if (this.timer) {
                    clearInterval(this.timer);
                }
                process.stdout.write("\x1B[?25h");
                const icon = success ? `${Colors.success}✓${Colors.reset}` : `${Colors.error}✗${Colors.reset}`;
                console.log(`\r${Colors.gray}│${Colors.reset}  ${icon} ${message}`);
            }
        };
    }
}

/**
 * @deprecated Use ProgressLogger de src/logging/
 */
export async function downloadWithProgress(
    url: string, 
    destination: string, 
    title: string
): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Falha ao baixar: ${response.statusText}`);
    }

    const totalSize = parseInt(response.headers.get("content-length") || "0");
    if (!totalSize) {
        // Sem content-length, usar spinner simples
        const spinner = new ThemedSpinner();
        const stop = spinner.start(title, "dots", "download");

        const data = await response.arrayBuffer();
        await Bun.write(destination, data);

        stop(true);
        return;
    }

    const progress = new ProgressBar({
        title,
        total: totalSize,
        width: 25
    });

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Sem response body");
    }

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        received += value.length;
        progress.update(received);
    }

    progress.complete();

    // Concatena chunks e salva
    const allChunks = new Uint8Array(received);
    let position = 0;
    for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
    }

    await Bun.write(destination, allChunks);
}
