import path from "path";
import fs from "fs";
import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import { EndpointService } from "../services/EndpointService";
import { Logger } from "../utils/ui";
import type { ApiEndpoint, ApiParam } from "../types/endpoint";

export class DocsCommand implements Command {
    async execute(config: AppConfig): Promise<void> {
        const srcPath = path.join(process.cwd(), "src");
        if (!fs.existsSync(srcPath)) {
            Logger.error("Pasta 'src' não encontrada. Certifique-se de estar na raiz do projeto Java.");
            return;
        }

        const contextPath = (config.project.appName || "").replace(".war", "");
        const endpoints = EndpointService.scan(srcPath, contextPath);

        if (endpoints.length === 0) {
            Logger.warn("Nenhum endpoint encontrado.");
            return;
        }

        Logger.section("API Documentation (Swagger-like)");
        console.log("");

        const grouped = this.groupByController(endpoints);

        for (const [controller, controllerEndpoints] of Object.entries(grouped)) {
            console.log(`  ${"\x1b[36m"}${controller}${"\x1b[0m"}`);
            console.log(`  ${"\x1b[90m"}──────────────────────────────────────────────────${"\x1b[0m"}`);

            for (const ep of controllerEndpoints) {
                this.renderEndpoint(ep, config.tomcat.port);
            }
            console.log("");
        }
    }

    private groupByController(endpoints: ApiEndpoint[]): Record<string, ApiEndpoint[]> {
        return endpoints.reduce((acc, ep) => {
            const controller = ep.className;
            if (!acc[controller]) acc[controller] = [];
            acc[controller].push(ep);
            return acc;
        }, {} as Record<string, ApiEndpoint[]>);
    }

    private renderEndpoint(ep: ApiEndpoint, port: number) {
        const methodColors: Record<string, string> = {
            GET: "\x1b[32m",
            POST: "\x1b[33m",
            PUT: "\x1b[34m",
            DELETE: "\x1b[31m",
            PATCH: "\x1b[35m",
            ALL: "\x1b[37m"
        };

        const color = methodColors[ep.method] || "\x1b[37m";
        const methodLabel = ep.method.padEnd(7);
        const fullUrl = `http://localhost:${port}${ep.fullPath}`;

        console.log(`    ${color}${methodLabel}${"\x1b[0m"} ${"\x1b[1m"}${ep.fullPath}${"\x1b[0m"}`);
        console.log(`            ${"\x1b[90m"}${ep.methodName}()${"\x1b[0m"}`);

        if (ep.parameters.length > 0) {
            console.log(`            ${"\x1b[90m"}Parameters:${"\x1b[0m"}`);
            for (const param of ep.parameters) {
                this.renderParameter(param);
            }
        }
        console.log("");
    }

    private renderParameter(param: ApiParam) {
        const sourceColors: Record<string, string> = {
            PATH: "\x1b[35m",
            QUERY: "\x1b[36m",
            BODY: "\x1b[33m",
            HEADER: "\x1b[32m",
            FORM: "\x1b[34m"
        };

        const color = sourceColors[param.source] || "\x1b[37m";
        const required = param.required ? "\x1b[31m*\x1b[0m" : "";
        
        console.log(`              ${color}[${param.source}]${"\x1b[0m"} ${param.name}${required} : ${"\x1b[90m"}${param.type}${"\x1b[0m"}`);
    }
}
