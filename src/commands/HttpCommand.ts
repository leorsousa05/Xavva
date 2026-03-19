/**
 * Comando de HTTP Client
 * xavva http <method> <url> [options]
 * xavva http --interactive
 */

import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { HttpService, type HttpRequest } from "../services/HttpService";
import { EndpointService } from "../services/EndpointService";
import { Logger } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";
import fs from "fs";
import path from "path";

export class HttpCommand implements Command {
    async execute(config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        const processManager = ProcessManager.getInstance();
        
        // Modo interativo
        if (args?.interactive || positionals?.length === 1) {
            const baseUrl = `http://localhost:${config.tomcat.port}`;
            const service = new HttpService(baseUrl);
            await service.interactive();
            return;
        }

        // Extrai método e URL
        const method = (positionals?.[1] || "GET").toUpperCase() as HttpRequest["method"];
        let url = positionals?.[2] || "/";

        // Se URL não começar com http, adiciona base
        const baseUrl = args?.["base-url"] || `http://localhost:${config.tomcat.port}`;
        if (!url.startsWith("http")) {
            url = `${baseUrl}${url.startsWith("/") ? url : `/${url}`}`;
        }

        // Parse headers
        const headers = this.parseHeaders(args);

        // Parse body
        let body: string | object | undefined;
        if (args?.body) {
            body = this.parseBody(args.body as string);
        } else if (args?.file) {
            const filePath = args.file as string;
            if (fs.existsSync(filePath)) {
                body = fs.readFileSync(filePath, "utf-8");
            } else {
                Logger.error(`File not found: ${filePath}`);
                await processManager.shutdown(1);
                return;
            }
        }

        // Parse query params
        const params = this.parseParams(args);

        // Cria request
        const request: HttpRequest = {
            method,
            url,
            headers,
            body,
            params,
            timeout: args?.timeout ? parseInt(args.timeout as string) : 30000
        };

        // Executa
        const service = new HttpService();
        
        try {
            await service.request(request);
        } catch (error) {
            await processManager.shutdown(1);
        }
    }

    private parseHeaders(args?: CLIArguments): Record<string, string> | undefined {
        const headers: Record<string, string> = {};
        
        // Formato: --header "Authorization: Bearer token"
        const headerArgs = args?.header;
        if (headerArgs) {
            const headerList = Array.isArray(headerArgs) ? headerArgs : [headerArgs];
            for (const h of headerList) {
                const match = h.match(/^([^:]+):\s*(.+)$/);
                if (match) {
                    headers[match[1]] = match[2];
                }
            }
        }

        // Content-Type shorthand
        if (args?.["content-type"]) {
            headers["Content-Type"] = args["content-type"] as string;
        }

        // Accept shorthand
        if (args?.accept) {
            headers["Accept"] = args.accept as string;
        }

        return Object.keys(headers).length > 0 ? headers : undefined;
    }

    private parseBody(bodyStr: string): string | object {
        // Tenta parsear como JSON
        try {
            return JSON.parse(bodyStr);
        } catch {
            // Retorna como string
            return bodyStr;
        }
    }

    private parseParams(args?: CLIArguments): Record<string, string> | undefined {
        const params: Record<string, string> = {};
        
        // Formato: --param "key=value"
        const paramArgs = args?.param;
        if (paramArgs) {
            const paramList = Array.isArray(paramArgs) ? paramArgs : [paramArgs];
            for (const p of paramList) {
                const [key, value] = p.split("=");
                if (key && value !== undefined) {
                    params[key] = value;
                }
            }
        }

        return Object.keys(params).length > 0 ? params : undefined;
    }
}
