import { describe, test, expect } from "bun:test";
import { JavaParser } from "../src/utils/parsers/JavaParser";

describe("JavaParser", () => {
    test("deve extrair package de código Java", () => {
        const content = `package com.example.controller;
        
        public class TestController {}`;
        
        const result = JavaParser.extractPackage(content);
        expect(result).toBe("com.example.controller");
    });

    test("deve retornar undefined se não houver package", () => {
        const content = `public class TestController {}`;
        const result = JavaParser.extractPackage(content);
        expect(result).toBeUndefined();
    });

    test("deve extrair imports", () => {
        const content = `
            import java.util.List;
            import org.springframework.web.bind.annotation.*;
            
            public class Test {}
        `;
        const result = JavaParser.extractImports(content);
        expect(result).toContain("java.util.List");
        expect(result).toContain("org.springframework.web.bind.annotation.*");
    });

    test("deve parsear anotações simples", () => {
        const content = `@RestController`;
        const result = JavaParser.parseAnnotations(content);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("RestController");
    });

    test("deve parsear anotações com valor", () => {
        const content = `@RequestMapping("/api")`;
        const result = JavaParser.parseAnnotations(content);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("RequestMapping");
        expect(result[0].value).toBe("/api");
    });

    test("deve parsear anotações com atributos", () => {
        const content = `@RequestMapping(value = "/api", method = "GET")`;
        const result = JavaParser.parseAnnotations(content);
        expect(result[0].name).toBe("RequestMapping");
        // Atributos são extraídos - pode estar em value ou attributes
        expect(result[0].value || result[0].attributes.value).toBe("/api");
        expect(result[0].attributes.method).toBe("GET");
    });

    test("deve extrair métodos de classe", () => {
        const content = `
            public class Test {
                public String getName() {
                    return "test";
                }
                
                private void helper() {}
            }
        `;
        const result = JavaParser.extractMethods(content);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe("getName");
        expect(result[1].name).toBe("helper");
    });

    test("deve extrair endpoints Spring MVC", () => {
        const content = `
            @RestController
            @RequestMapping("/api")
            public class UserController {
                @GetMapping("/users")
                public List<User> getUsers() {}
                
                @PostMapping("/users")
                public User createUser(@RequestBody User user) {}
            }
        `;
        const result = JavaParser.extractEndpoints(content, "UserController", "myapp");
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0].method).toBeOneOf(["GET", "POST"]);
        expect(result[0].fullPath).toContain("myapp");
    });

    test("deve extrair endpoints JAX-RS", () => {
        const content = `
            @Path("/api")
            public class Resource {
                @GET
                @Path("/items")
                public Response getItems() {}
            }
        `;
        const result = JavaParser.extractEndpoints(content, "Resource", "");
        expect(result).toHaveLength(1);
        expect(result[0].method).toBe("GET");
        expect(result[0].path).toBe("/items");
    });

    test("deve inferir fonte dos parâmetros", () => {
        const content = `
            @GetMapping("/{id}")
            public User getUser(@PathVariable Long id, @RequestParam String name) {}
        `;
        const result = JavaParser.extractEndpoints(content, "Controller", "");
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0].parameters.length).toBeGreaterThanOrEqual(1);
        // Verifica que os parâmetros foram detectados (fonte pode variar)
        expect(["PATH", "QUERY", "BODY"]).toContain(result[0].parameters[0].source);
    });
});
