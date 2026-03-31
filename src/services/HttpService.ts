/**
 * Serviço de HTTP Client para testar APIs
 * Similar ao Postman/curl mas integrado com o projeto
 */

import { Logger, C } from "../utils/ui";
import type { ApiEndpoint } from "../types/endpoint";

export interface HttpRequest {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
    url: string;
    headers?: Record<string, string>;
    body?: string | object;
    params?: Record<string, string>;
    timeout?: number;
}

export interface HttpResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string | object;
    duration: number;
    size: number;
}

export interface HttpCollection {
    name: string;
    requests: HttpRequest[];
}

export class HttpService {
    private baseUrl: string;
    private defaultHeaders: Record<string, string>;

    constructor(baseUrl: string = "", defaultHeaders: Record<string, string> = {}) {
        this.baseUrl = baseUrl;
        this.defaultHeaders = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            ...defaultHeaders
        };
    }

    /**
     * Executa uma requisição HTTP
     */
    async request(req: HttpRequest): Promise<HttpResponse> {
        const startTime = Date.now();
        const url = this.buildUrl(req.url, req.params);
        
        Logger.step(`${req.method} ${url}`);

        const headers = { ...this.defaultHeaders, ...req.headers };
        const body = req.body ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body)) : undefined;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), req.timeout || 30000);

            const response = await fetch(url, {
                method: req.method,
                headers,
                body,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const duration = Date.now() - startTime;
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            const responseBody = await this.parseBody(response);
            const size = JSON.stringify(responseBody).length;

            const result: HttpResponse = {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseBody,
                duration,
                size
            };

            this.printResponse(result);
            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            Logger.error(`Request failed: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Executa múltiplas requisições em sequência
     */
    async runCollection(requests: HttpRequest[]): Promise<HttpResponse[]> {
        Logger.section(`Running ${requests.length} requests`);
        const results: HttpResponse[] = [];

        for (let i = 0; i < requests.length; i++) {
            Logger.info(`Request`, `${i + 1}/${requests.length}`);
            try {
                const result = await this.request(requests[i]);
                results.push(result);
            } catch (error) {
                Logger.error(`Request ${i + 1} failed`);
            }
        }

        Logger.endSection();
        return results;
    }

    /**
     * Testa um endpoint descoberto automaticamente
     */
    async testEndpoint(endpoint: ApiEndpoint, baseUrl: string): Promise<HttpResponse> {
        const url = `${baseUrl}${endpoint.fullPath}`;
        
        // Gera um body de exemplo baseado nos parâmetros
        const body = this.generateExampleBody(endpoint);

        return this.request({
            method: endpoint.method === "ALL" ? "GET" : endpoint.method,
            url,
            body
        });
    }

    /**
     * Modo interativo - CLI HTTP client
     */
    async interactive(): Promise<void> {
        Logger.section("HTTP Client Interactive Mode");
        Logger.info("Commands:", "GET /path, POST /path, PUT /path, DELETE /path");
        Logger.info("Headers:", "header:Name:Value");
        Logger.info("Body:", "body:{\"key\":\"value\"}");
        Logger.info("Exit:", "quit or exit");
        Logger.endSection();

        // Implementação básica - em produção usaria readline
        Logger.info("Tip", "Use individual commands instead:");
        Logger.info("Example", "xavva http GET /api/users");
    }

    /**
     * Carrega uma coleção de requisições de um arquivo
     */
    loadCollection(filePath: string): HttpCollection {
        const fs = require("fs");
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    }

    /**
     * Salva uma coleção de requisições
     */
    saveCollection(collection: HttpCollection, filePath: string): void {
        const fs = require("fs");
        fs.writeFileSync(filePath, JSON.stringify(collection, null, 2));
    }

    private buildUrl(url: string, params?: Record<string, string>): string {
        let fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
        
        if (params && Object.keys(params).length > 0) {
            const searchParams = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
                searchParams.append(key, value);
            }
            fullUrl += `?${searchParams.toString()}`;
        }

        return fullUrl;
    }

    private async parseBody(response: Response): Promise<string | object> {
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();

        if (contentType.includes("application/json")) {
            try {
                return JSON.parse(text);
            } catch {
                return text;
            }
        }

        return text;
    }

    private printResponse(res: HttpResponse): void {
        const statusColor = res.status < 300 ? C.success 
            : res.status < 400 ? C.warning 
            : C.error;

        Logger.divider();
        Logger.info("Status", `${statusColor}${res.status} ${res.statusText}${C.reset}`);
        Logger.info("Duration", `${res.duration}ms`);
        Logger.info("Size", `${this.formatBytes(res.size)}`);

        if (typeof res.body === "object") {
            Logger.divider();
            console.log(JSON.stringify(res.body, null, 2));
        } else if (res.body) {
            Logger.divider();
            console.log(res.body.slice(0, 1000));
            if (res.body.length > 1000) {
                Logger.dim(`... (${res.body.length - 1000} more characters)`);
            }
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    private generateExampleBody(endpoint: ApiEndpoint): object | undefined {
        if (endpoint.method === "GET" || endpoint.method === "DELETE") {
            return undefined;
        }

        const body: Record<string, unknown> = {};
        for (const param of endpoint.parameters) {
            if (param.source === "BODY") {
                // Gera exemplo baseado no tipo
                switch (param.type.toLowerCase()) {
                    case "string":
                        body[param.name] = "example";
                        break;
                    case "int":
                    case "integer":
                    case "long":
                        body[param.name] = 123;
                        break;
                    case "boolean":
                        body[param.name] = true;
                        break;
                    case "double":
                    case "float":
                    case "bigdecimal":
                        body[param.name] = 99.99;
                        break;
                    default:
                        body[param.name] = null;
                }
            }
        }

        return Object.keys(body).length > 0 ? body : undefined;
    }
}
