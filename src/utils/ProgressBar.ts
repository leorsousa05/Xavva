import { Logger } from "./ui";

export interface ProgressBarOptions {
    title: string;
    total: number;
    width?: number;
    showPercentage?: boolean;
    showEta?: boolean;
}

export class ProgressBar {
    private current = 0;
    private startTime: number;
    private options: Required<ProgressBarOptions>;
    private isComplete = false;

    constructor(options: ProgressBarOptions) {
        this.options = {
            width: 30,
            showPercentage: true,
            showEta: true,
            ...options
        };
        this.startTime = Date.now();
    }

    update(current: number): void {
        if (this.isComplete) return;
        this.current = Math.min(current, this.options.total);
        this.render();
    }

    increment(amount = 1): void {
        this.update(this.current + amount);
    }

    complete(): void {
        if (this.isComplete) return;
        this.current = this.options.total;
        this.isComplete = true;
        this.render();
        process.stdout.write("\n");
    }

    private render(): void {
        const { title, total, width, showPercentage, showEta } = this.options;
        const ratio = this.current / total;
        const filled = Math.floor(ratio * width);
        const empty = width - filled;

        const bar = "█".repeat(filled) + "░".repeat(empty);
        const percentage = Math.floor(ratio * 100);

        let line = `${Logger.C.gray}│${Logger.C.reset}  ${Logger.C.primary}▸${Logger.C.reset} ${Logger.C.dim}${title}${Logger.C.reset} `;
        line += `${Logger.C.primary}[${bar}]${Logger.C.reset}`;

        if (showPercentage) {
            line += ` ${Logger.C.white}${percentage}%${Logger.C.reset}`;
        }

        if (showEta && this.current > 0) {
            const elapsed = Date.now() - this.startTime;
            const eta = Math.ceil((elapsed / this.current) * (total - this.current) / 1000);
            line += ` ${Logger.C.gray}(ETA: ${eta}s)${Logger.C.reset}`;
        }

        // Clear line and write new content
        process.stdout.write(`\r${line}`);
    }
}

// Spinner especializado para diferentes operações
export class ThemedSpinner {
    private static frames = {
        default: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
        dots: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
        line: ["-", "\\", "|", "/"],
        arrow: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
        pulse: ["█", "▉", "▊", "▋", "▌", "▍", "▎", "▏"],
        moon: ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"]
    };

    private static colors = {
        default: Logger.C.primary,
        build: Logger.C.warning,
        download: Logger.C.info,
        deploy: Logger.C.success,
        watch: Logger.C.secondary
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

        process.stdout.write(`${Logger.C.gray}│${Logger.C.reset}  `);
        process.stdout.write("\x1B[?25l");

        this.timer = setInterval(() => {
            const frame = frames[this.frameIndex];
            process.stdout.write(`\r${Logger.C.gray}│${Logger.C.reset}  ${colorCode}${frame}${Logger.C.reset} ${Logger.C.dim}${message}${Logger.C.reset}`);
            this.frameIndex = (this.frameIndex + 1) % frames.length;
        }, 80);

        return {
            stop: (success = true) => {
                if (this.timer) {
                    clearInterval(this.timer);
                }
                process.stdout.write("\x1B[?25h");
                const icon = success ? `${Logger.C.success}✓${Logger.C.reset}` : `${Logger.C.error}✗${Logger.C.reset}`;
                console.log(`\r${Logger.C.gray}│${Logger.C.reset}  ${icon} ${message}`);
            }
        };
    }
}

// Função auxiliar para downloads com progresso
export async function downloadWithProgress(
    url: string, 
    destination: string, 
    title: string
): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
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
        throw new Error("No response body");
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
