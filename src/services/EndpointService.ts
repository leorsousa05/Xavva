import { readdirSync, readFileSync } from "fs";
import path from "path";
import type { ApiEndpoint, ApiParam } from "../types/endpoint";

export class EndpointService {
    static scan(srcPath: string, contextPath: string = ""): ApiEndpoint[] {
        const endpoints: ApiEndpoint[] = [];
        
        const scanDir = (dir: string) => {
            const list = readdirSync(dir, { withFileTypes: true });
            for (const item of list) {
                const res = path.resolve(dir, item.name);
                if (item.isDirectory()) {
                    if (!['node_modules', '.git', 'target', 'build'].includes(item.name)) {
                        scanDir(res);
                    }
                } else if (item.name.endsWith('.java')) {
                    const content = readFileSync(res, 'utf8');
                    const fileEndpoints = this.parseJavaFile(content, item.name, contextPath);
                    endpoints.push(...fileEndpoints);
                }
            }
        };

        try {
            scanDir(srcPath);
        } catch (e) {}

        return endpoints.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
    }

    private static parseJavaFile(content: string, fileName: string, contextPath: string): ApiEndpoint[] {
        const endpoints: ApiEndpoint[] = [];
        const className = fileName.replace(".java", "");

        const classPathMatch = content.match(/@(Path|RequestMapping)\s*\(\s*["'](.*?)["']\s*\)/);
        const basePath = classPathMatch ? this.normalizePath(classPathMatch[2]) : "";

        const methodRegex = /@(GET|POST|PUT|DELETE|PATCH|Path|RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*(\(\s*["'](.*?)["']\s*\))?\s*([\s\S]*?)\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)/g;
        
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            const annotation = match[1];
            const pathArg = match[3] || "";
            const methodName = match[5];
            const paramsRaw = match[6];

            const method = this.inferHttpMethod(annotation);
            const methodPath = this.normalizePath(pathArg);
            const fullPath = this.combinePaths(contextPath, basePath, methodPath);

            const parameters = this.parseParameters(paramsRaw);

            endpoints.push({
                method,
                path: methodPath,
                fullPath,
                className,
                methodName,
                parameters
            });
        }

        return endpoints;
    }

    private static inferHttpMethod(annotation: string): ApiEndpoint["method"] {
        if (annotation.includes("GET")) return "GET";
        if (annotation.includes("POST")) return "POST";
        if (annotation.includes("PUT")) return "PUT";
        if (annotation.includes("DELETE")) return "DELETE";
        if (annotation.includes("PATCH")) return "PATCH";
        return "ALL";
    }

    private static normalizePath(p: string): string {
        if (!p) return "";
        let path = p.trim();
        if (!path.startsWith("/")) path = "/" + path;
        if (path.endsWith("/")) path = path.slice(0, -1);
        return path;
    }

    private static combinePaths(...parts: string[]): string {
        return parts
            .map(p => this.normalizePath(p))
            .filter(p => p && p !== "/")
            .join("") || "/";
    }

    private static parseParameters(paramsRaw: string): ApiParam[] {
        const params: ApiParam[] = [];
        if (!paramsRaw.trim()) return params;

        const individualParams = paramsRaw.split(",");
        for (const p of individualParams) {
            const trimmed = p.trim();
            
            const pathParam = trimmed.match(/@PathParam\s*\(\s*["'](.*?)["']\s*\)\s*(\w+)\s+(\w+)/);
            const pathVariable = trimmed.match(/@PathVariable\s*\(\s*["'](.*?)["']\s*\)\s*(\w+)\s+(\w+)/);
            const queryParam = trimmed.match(/@QueryParam\s*\(\s*["'](.*?)["']\s*\)\s*(\w+)\s+(\w+)/);
            const requestParam = trimmed.match(/@RequestParam\s*\(\s*["'](.*?)["']\s*\)\s*(\w+)\s+(\w+)/);
            const headerParam = trimmed.match(/@HeaderParam\s*\(\s*["'](.*?)["']\s*\)\s*(\w+)\s+(\w+)/);
            const requestBody = trimmed.match(/@RequestBody\s*(\w+)\s+(\w+)/);

            if (pathParam || pathVariable) {
                const m = pathParam || pathVariable!;
                params.push({ name: m[1], type: m[2], source: "PATH", required: true });
            } else if (queryParam || requestParam) {
                const m = queryParam || requestParam!;
                params.push({ name: m[1], type: m[2], source: "QUERY", required: !trimmed.includes("required = false") });
            } else if (headerParam) {
                params.push({ name: headerParam[1], type: headerParam[2], source: "HEADER", required: true });
            } else if (requestBody) {
                params.push({ name: "body", type: requestBody[1], source: "BODY", required: true });
            }
        }

        return params;
    }
}
