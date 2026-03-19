import { describe, test, expect } from "bun:test";
import { PathUtils } from "../src/utils/PathUtils";

describe("PathUtils", () => {
    test("deve normalizar separadores para forward slash", () => {
        const result = PathUtils.normalizeSeparators("src\\main\\java\\Test.java");
        expect(result).toBe("src/main/java/Test.java");
    });

    test("deve identificar arquivo Java", () => {
        expect(PathUtils.isJavaFile("Test.java")).toBe(true);
        expect(PathUtils.isJavaFile("test.JAVA")).toBe(true);
        expect(PathUtils.isJavaFile("pom.xml")).toBe(false);
    });

    test("deve identificar arquivo de recurso web", () => {
        expect(PathUtils.isWebResource("index.jsp")).toBe(true);
        expect(PathUtils.isWebResource("style.css")).toBe(true);
        expect(PathUtils.isWebResource("script.js")).toBe(true);
        expect(PathUtils.isWebResource("Main.java")).toBe(false);
    });

    test("deve identificar arquivo de configuração de build", () => {
        expect(PathUtils.isBuildConfig("pom.xml")).toBe(true);
        expect(PathUtils.isBuildConfig("build.gradle")).toBe(true);
        expect(PathUtils.isBuildConfig("Main.java")).toBe(false);
    });

    test("deve converter Java para Class path", () => {
        const result = PathUtils.javaToClassPath("com/example/Test.java");
        expect(result).toBe("com/example/Test.class");
    });

    test("deve extrair package de path", () => {
        const result = PathUtils.extractPackageFromPath("src/main/java/com/example/Test.java");
        expect(result).toBe("com.example");
    });

    test("deve retornar null se não encontrar package", () => {
        const result = PathUtils.extractPackageFromPath("Test.java");
        expect(result).toBeNull();
    });

    test("deve encontrar webapp root", () => {
        const result = PathUtils.findWebappRoot("src/main/webapp/WEB-INF/web.xml");
        expect(result).toBe("src/main/webapp");
    });

    test("deve obter caminho relativo dentro do webapp", () => {
        const result = PathUtils.getWebappRelativePath("src/main/webapp/index.jsp");
        expect(result).toBe("index.jsp");
    });

    test("deve identificar path ignorado", () => {
        expect(PathUtils.isIgnoredPath("target/classes/Test.class")).toBe(true);
        expect(PathUtils.isIgnoredPath("node_modules/lodash/index.js")).toBe(true);
        expect(PathUtils.isIgnoredPath("src/main/java/Test.java")).toBe(false);
    });

    test("deve resolver context path do WAR", () => {
        expect(PathUtils.resolveContextPath("myapp.war")).toBe("myapp");
        expect(PathUtils.resolveContextPath("myapp.WAR")).toBe("myapp");
    });
});
