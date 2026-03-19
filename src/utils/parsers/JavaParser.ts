/**
 * Parser de código Java
 * Centraliza análise de anotações e estrutura de arquivos .java
 */

import type { ApiEndpoint, ApiParam } from "../../types/endpoint";

export interface JavaClassInfo {
    className: string;
    package?: string;
    annotations: AnnotationInfo[];
    methods: JavaMethodInfo[];
}

export interface AnnotationInfo {
    name: string;
    value?: string;
    attributes: Record<string, string>;
}

export interface JavaMethodInfo {
    name: string;
    annotations: AnnotationInfo[];
    parameters: JavaParameterInfo[];
    returnType?: string;
}

export interface JavaParameterInfo {
    name: string;
    type: string;
    annotations: AnnotationInfo[];
}

export class JavaParser {
    /**
     * Extrai informações completas de uma classe Java
     */
    static parseClass(content: string, fileName: string): JavaClassInfo {
        const className = fileName.replace(/\.java$/i, "");
        
        return {
            className,
            package: this.extractPackage(content),
            annotations: this.extractClassAnnotations(content),
            methods: this.extractMethods(content),
        };
    }

    /**
     * Extrai package declaration
     */
    static extractPackage(content: string): string | undefined {
        const match = content.match(/package\s+([\w.]+)\s*;/);
        return match?.[1];
    }

    /**
     * Extrai imports
     */
    static extractImports(content: string): string[] {
        const imports: string[] = [];
        const regex = /import\s+([\w.*]+)\s*;/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        return imports;
    }

    /**
     * Extrai anotações de classe
     */
    static extractClassAnnotations(content: string): AnnotationInfo[] {
        // Procura anotações antes da declaração da classe
        const classMatch = content.match(/(@[\w\s(,="{}[\]]+)\s+(?:public\s+)?(?:abstract\s+)?class\s+\w+/);
        if (!classMatch) return [];
        
        return this.parseAnnotations(classMatch[1]);
    }

    /**
     * Extrai métodos da classe
     */
    static extractMethods(content: string): JavaMethodInfo[] {
        const methods: JavaMethodInfo[] = [];
        
        // Regex melhorado para encontrar métodos
        // Procura por padrões como: @Anotacao public Tipo metodo(params)
        // Também captura métodos sem anotações
        const methodPattern = /((?:@[\w]+(?:\s*\([^)]*\))?\s*)*)\s*(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?([\w<>[\],\s.?]+)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*[{;]/g;
        
        let match;
        while ((match = methodPattern.exec(content)) !== null) {
            const annotationsStr = match[1] || "";
            const returnType = match[2].trim();
            const name = match[3];
            const paramsStr = match[4];
            
            // Pula métodos que parecem ser construtores (tipo == nome da classe)
            // ou que não têm tipo de retorno válido
            if (!returnType || returnType === name) continue;
            
            methods.push({
                name,
                annotations: this.parseAnnotations(annotationsStr),
                parameters: this.parseParameters(paramsStr),
                returnType,
            });
        }
        
        return methods;
    }

    /**
     * Parse de string de anotações
     */
    static parseAnnotations(annotationsStr: string): AnnotationInfo[] {
        const annotations: AnnotationInfo[] = [];
        
        // Regex para anotações: @Nome ou @Nome(atributos)
        const regex = /@(\w+)(?:\s*\(\s*([^)]*)\s*\))?/g;
        
        let match;
        while ((match = regex.exec(annotationsStr)) !== null) {
            const name = match[1];
            const attrsStr = match[2] || "";
            
            const { value, attributes } = this.parseAnnotationAttributes(attrsStr);
            
            annotations.push({ name, value, attributes });
        }
        
        return annotations;
    }

    /**
     * Parse de atributos de anotação
     */
    private static parseAnnotationAttributes(attrsStr: string): { value?: string; attributes: Record<string, string> } {
        const attributes: Record<string, string> = {};
        let value: string | undefined;
        
        if (!attrsStr.trim()) {
            return { value, attributes };
        }
        
        // Verifica se é valor simples (string literal ou array)
        const simpleValueMatch = attrsStr.match(/^\s*["']([^"']+)["']\s*$/);
        if (simpleValueMatch) {
            value = simpleValueMatch[1];
            return { value, attributes };
        }
        
        // Parse de atributos chave=valor
        // Pega tudo entre aspas após um sinal de igual
        const attrRegex = /(\w+)\s*=\s*["']([^"']*?)["']/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
            const key = attrMatch[1];
            const val = attrMatch[2];
            
            if (key === "value") {
                value = val;
            } else {
                attributes[key] = val;
            }
        }
        
        // Se não encontrou atributos com regex, tenta extrair valor como string simples
        if (Object.keys(attributes).length === 0 && !value) {
            const simpleMatch = attrsStr.match(/["']([^"']+)["']/);
            if (simpleMatch) {
                value = simpleMatch[1];
            }
        }
        
        return { value, attributes };
    }

    /**
     * Parse de parâmetros de método
     */
    static parseParameters(paramsStr: string): JavaParameterInfo[] {
        const parameters: JavaParameterInfo[] = [];
        
        if (!paramsStr.trim()) {
            return parameters;
        }
        
        // Divide por vírgula, mas cuida com generics
        const params = this.splitParams(paramsStr);
        
        for (const param of params) {
            const trimmed = param.trim();
            if (!trimmed) continue;
            
            // Extrai anotações do parâmetro
            const annotations: AnnotationInfo[] = [];
            let paramWithoutAnnotations = trimmed;
            
            const annoRegex = /@(\w+)\s*\(\s*["']([^"']+)["']\s*\)/g;
            let annoMatch;
            while ((annoMatch = annoRegex.exec(trimmed)) !== null) {
                annotations.push({
                    name: annoMatch[1],
                    value: annoMatch[2],
                    attributes: {},
                });
                paramWithoutAnnotations = paramWithoutAnnotations.replace(annoMatch[0], "").trim();
            }
            
            // Tipo e nome
            const parts = paramWithoutAnnotations.split(/\s+/);
            if (parts.length >= 2) {
                parameters.push({
                    type: parts.slice(0, -1).join(" "),
                    name: parts[parts.length - 1],
                    annotations,
                });
            }
        }
        
        return parameters;
    }

    /**
     * Divide string de parâmetros respeitando generics
     */
    private static splitParams(paramsStr: string): string[] {
        const result: string[] = [];
        let current = "";
        let depth = 0;
        
        for (const char of paramsStr) {
            if (char === "<") {
                depth++;
                current += char;
            } else if (char === ">") {
                depth--;
                current += char;
            } else if (char === "," && depth === 0) {
                result.push(current);
                current = "";
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            result.push(current);
        }
        
        return result;
    }

    /**
     * Extrai endpoints REST de um arquivo Java
     * Suporta Spring MVC, JAX-RS, Jersey
     */
    static extractEndpoints(content: string, fileName: string, contextPath: string = ""): ApiEndpoint[] {
        const classInfo = this.parseClass(content, fileName);
        const endpoints: ApiEndpoint[] = [];
        
        // Encontra path base da classe
        const basePath = this.extractBasePath(classInfo.annotations);
        
        for (const method of classInfo.methods) {
            const methodPath = this.extractMethodPath(method.annotations);
            const httpMethod = this.inferHttpMethod(method.annotations);
            
            if (!methodPath && httpMethod === "ALL") continue;
            
            const fullPath = this.combinePaths(contextPath, basePath, methodPath);
            
            endpoints.push({
                method: httpMethod,
                path: methodPath || "/",
                fullPath,
                className: classInfo.className,
                methodName: method.name,
                parameters: this.convertParams(method.parameters),
            });
        }
        
        return endpoints;
    }

    /**
     * Extrai path base de anotações de classe
     */
    private static extractBasePath(annotations: AnnotationInfo[]): string {
        // Spring: @RequestMapping("/path") ou @Path("/path") (JAX-RS)
        const mapping = annotations.find(a => 
            a.name === "RequestMapping" || a.name === "Path"
        );
        return mapping?.value || "";
    }

    /**
     * Extrai path de método de anotações
     */
    private static extractMethodPath(annotations: AnnotationInfo[]): string {
        // Procura qualquer anotação que tenha valor de path
        const pathAnnotations = [
            "RequestMapping", "GetMapping", "PostMapping", 
            "PutMapping", "DeleteMapping", "PatchMapping",
            "Path"
        ];
        
        const mapping = annotations.find(a => pathAnnotations.includes(a.name));
        return mapping?.value || "";
    }

    /**
     * Infere método HTTP de anotações
     */
    private static inferHttpMethod(annotations: AnnotationInfo[]): ApiEndpoint["method"] {
        const annoNames = annotations.map(a => a.name);
        
        if (annoNames.includes("GetMapping")) return "GET";
        if (annoNames.includes("PostMapping")) return "POST";
        if (annoNames.includes("PutMapping")) return "PUT";
        if (annoNames.includes("DeleteMapping")) return "DELETE";
        if (annoNames.includes("PatchMapping")) return "PATCH";
        
        // JAX-RS
        if (annoNames.includes("GET")) return "GET";
        if (annoNames.includes("POST")) return "POST";
        if (annoNames.includes("PUT")) return "PUT";
        if (annoNames.includes("DELETE")) return "DELETE";
        if (annoNames.includes("PATCH")) return "PATCH";
        
        // RequestMapping genérico
        if (annoNames.includes("RequestMapping")) {
            const mapping = annotations.find(a => a.name === "RequestMapping");
            const methodAttr = mapping?.attributes?.method;
            if (methodAttr) {
                const method = methodAttr.replace(/RequestMethod\./g, "").toUpperCase();
                if (["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {
                    return method as ApiEndpoint["method"];
                }
            }
            return "ALL";
        }
        
        return "ALL";
    }

    /**
     * Converte parâmetros Java para ApiParam
     */
    private static convertParams(params: JavaParameterInfo[]): ApiParam[] {
        return params.map(p => {
            const source = this.inferParamSource(p.annotations);
            const required = !p.annotations.some(a => 
                a.name === "RequestParam" && a.attributes?.required === "false"
            );
            
            return {
                name: p.name,
                type: p.type,
                source,
                required,
            };
        });
    }

    /**
     * Infere fonte do parâmetro (PATH, QUERY, BODY, HEADER)
     */
    private static inferParamSource(annotations: AnnotationInfo[]): ApiParam["source"] {
        const annoNames = annotations.map(a => a.name);
        
        if (annoNames.includes("PathVariable") || annoNames.includes("PathParam")) {
            return "PATH";
        }
        if (annoNames.includes("RequestParam") || annoNames.includes("QueryParam")) {
            return "QUERY";
        }
        if (annoNames.includes("RequestBody")) {
            return "BODY";
        }
        if (annoNames.includes("RequestHeader") || annoNames.includes("HeaderParam")) {
            return "HEADER";
        }
        
        return "QUERY"; // Default
    }

    /**
     * Combina múltiplos paths
     */
    private static combinePaths(...parts: string[]): string {
        return parts
            .map(p => p.trim())
            .map(p => (p.startsWith("/") ? p : "/" + p))
            .map(p => (p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p))
            .filter(p => p && p !== "/")
            .join("") || "/";
    }
}

// Exporta funções standalone
export const {
    parseClass,
    extractPackage,
    extractImports,
    extractClassAnnotations,
    extractMethods,
    parseAnnotations,
    parseParameters,
    extractEndpoints,
} = JavaParser;
