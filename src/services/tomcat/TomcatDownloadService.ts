/**
 * Serviço de download avançado do Tomcat
 * 
 * Features:
 * - Retry automático com backoff exponencial
 * - Resume de download (HTTP Range)
 * - Progresso detalhado (MB/s, ETA)
 * - Suporte a proxy
 * - Modo headless/silencioso
 */
import { Logger } from "../../logging";
import { ProgressBar, ThemedSpinner } from "../../utils/ProgressBar";
import { existsSync, createWriteStream, promises as fsPromises } from "fs";
import path from "path";
import type { TomcatProxyConfig } from "./types";

export interface DownloadOptions {
    url: string;
    destPath: string;
    /** Tamanho total esperado (para validação) */
    expectedSize?: number;
    /** Checksum esperado (SHA512) */
    expectedChecksum?: string;
    /** Retry em caso de falha */
    retries?: number;
    /** Timeout em ms */
    timeout?: number;
    /** Configuração de proxy */
    proxy?: TomcatProxyConfig;
    /** Continuar download parcial */
    resume?: boolean;
    /** Modo silencioso (para CI/CD) */
    silent?: boolean;
    /** Título para progresso */
    title?: string;
    /** Callback de progresso */
    onProgress?: (downloaded: number, total: number, speed: number, eta: number) => void;
}

export interface DownloadResult {
    success: boolean;
    destPath: string;
    size: number;
    duration: number;
    speed: number; // MB/s
    resumed: boolean;
    attempts: number;
    error?: string;
}

export class TomcatDownloadService {
    private logger = Logger.getInstance();
    private abortController?: AbortController;

    /**
     * Download com retry automático e resume
     */
    async download(options: DownloadOptions): Promise<DownloadResult> {
        const {
            url,
            destPath,
            retries = 3,
            timeout = 300000, // 5 minutos
            resume = true,
            silent = false,
            title = "Download",
            proxy,
            onProgress
        } = options;

        const startTime = Date.now();
        let lastError: Error | undefined;
        let attempts = 0;
        let resumed = false;

        // Verifica se pode resumir
        let startByte = 0;
        if (resume && existsSync(destPath)) {
            const stats = await fsPromises.stat(destPath).catch(() => null);
            if (stats && stats.size > 0) {
                startByte = stats.size;
                resumed = true;
                if (!silent) {
                    this.logger.info(`Continuando download de ${this.formatBytes(startByte)}`);
                }
            }
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            attempts = attempt;
            
            try {
                if (!silent && attempt > 1) {
                    this.logger.warn(`Tentativa ${attempt}/${retries}...`);
                }

                const result = await this.doDownload({
                    url,
                    destPath,
                    startByte,
                    timeout,
                    proxy,
                    silent,
                    title,
                    onProgress
                });

                const duration = (Date.now() - startTime) / 1000;
                const sizeMB = result.size / 1024 / 1024;
                const speed = duration > 0 ? sizeMB / duration : 0;

                return {
                    success: true,
                    destPath,
                    size: result.size,
                    duration,
                    speed,
                    resumed,
                    attempts
                };

            } catch (error) {
                lastError = error as Error;
                
                if (!silent) {
                    this.logger.error(`Falha na tentativa ${attempt}: ${lastError.message}`);
                }

                if (attempt < retries) {
                    // Backoff exponencial: 1s, 2s, 4s
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    if (!silent) {
                        this.logger.info(`Aguardando ${delay / 1000}s antes de retry...`);
                    }
                    await this.sleep(delay);
                }
            }
        }

        // Todas as tentativas falharam
        return {
            success: false,
            destPath,
            size: 0,
            duration: (Date.now() - startTime) / 1000,
            speed: 0,
            resumed,
            attempts,
            error: lastError?.message || "Download falhou após todas as tentativas"
        };
    }

    /**
     * Download único com suporte a resume
     */
    private async doDownload(params: {
        url: string;
        destPath: string;
        startByte: number;
        timeout: number;
        proxy?: TomcatProxyConfig;
        silent: boolean;
        title: string;
        onProgress?: (downloaded: number, total: number, speed: number, eta: number) => void;
    }): Promise<{ size: number }> {
        const { url, destPath, startByte, timeout, proxy, silent, title, onProgress } = params;

        // Prepara headers
        const headers: Record<string, string> = {};
        if (startByte > 0) {
            headers["Range"] = `bytes=${startByte}-`;
        }

        // Configura proxy se necessário
        let fetchUrl = url;
        const fetchOptions: RequestInit = {
            headers,
            signal: this.createTimeoutSignal(timeout)
        };

        // Para proxy, usamos variáveis de ambiente ou config explícita
        if (proxy?.http || proxy?.https) {
            // Bun respeita HTTP_PROXY/HTTPS_PROXY automaticamente
            if (proxy.http) {
                process.env.HTTP_PROXY = proxy.http;
            }
            if (proxy.https) {
                process.env.HTTPS_PROXY = proxy.https;
            }
        }

        const response = await fetch(fetchUrl, fetchOptions);

        if (!response.ok && response.status !== 206) { // 206 = Partial Content
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentLength = response.headers.get("content-length");
        const totalSize = contentLength ? parseInt(contentLength) + startByte : startByte;
        const isResumed = response.status === 206;

        // Determina modo de escrita
        const flags = isResumed || startByte > 0 ? "a" : "w";
        const fileStream = createWriteStream(destPath, { flags });

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error("Response body não disponível");
        }

        // Progress tracking
        let downloaded = startByte;
        const startTime = Date.now();
        let lastProgressTime = startTime;
        let lastDownloaded = startByte;

        // Progress bar ou spinner
        let progressBar: ProgressBar | null = null;
        let spinnerStop: ((success: boolean) => void) | null = null;

        if (!silent) {
            if (totalSize > 0) {
                progressBar = new ProgressBar({
                    title,
                    total: totalSize,
                    width: 30,
                    showSpeed: true,
                    showEta: true
                });
            } else {
                const spinner = new ThemedSpinner();
                spinnerStop = spinner.start(title, "dots", "download");
            }
        }

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Escreve chunk
                fileStream.write(Buffer.from(value));
                downloaded += value.length;

                // Calcula velocidade e ETA
                const now = Date.now();
                const elapsed = (now - startTime) / 1000;
                const speed = elapsed > 0 ? (downloaded / 1024 / 1024) / elapsed : 0;
                
                // ETA
                let eta = 0;
                if (totalSize > 0 && speed > 0) {
                    const remaining = (totalSize - downloaded) / 1024 / 1024;
                    eta = remaining / speed;
                }

                // Atualiza progresso a cada 200ms ou quando completo
                if (now - lastProgressTime > 200 || done) {
                    if (progressBar) {
                        progressBar.update(downloaded, speed, eta);
                    }
                    
                    if (onProgress) {
                        onProgress(downloaded, totalSize, speed, eta);
                    }

                    lastProgressTime = now;
                    lastDownloaded = downloaded;
                }
            }

            fileStream.end();

            // Finaliza progresso
            if (progressBar) {
                progressBar.complete();
            } else if (spinnerStop) {
                spinnerStop(true);
            }

            // Verifica tamanho final
            const stats = await fsPromises.stat(destPath);
            
            return { size: stats.size };

        } catch (error) {
            fileStream.destroy();
            if (progressBar) {
                // não precisa fazer nada
            } else if (spinnerStop) {
                spinnerStop(false);
            }
            throw error;
        }
    }

    /**
     * Aborta download em andamento
     */
    abort(): void {
        this.abortController?.abort();
    }

    /**
     * Cria signal com timeout
     */
    private createTimeoutSignal(ms: number): AbortSignal {
        this.abortController = new AbortController();
        const timeoutId = setTimeout(() => this.abortController?.abort(), ms);
        
        // Limpa timeout se signal for usado antes
        const signal = this.abortController.signal;
        signal.addEventListener("abort", () => clearTimeout(timeoutId));
        
        return signal;
    }

    /**
     * Formata bytes para string legível
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    /**
     * Sleep utilitário
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
