import { expect, test, describe, mock, beforeAll, afterAll } from "bun:test";
import { ProjectService } from "../src/services/ProjectService";
import type { ProjectConfig } from "../src/types/config";
import path from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";

describe("ProjectService", () => {
    const tempDir = path.join(process.cwd(), "test-workspace-ps");

    beforeAll(() => {
        if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true });
        }
    });

    afterAll(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    test("deve retornar o diretório de build correto para Maven", () => {
        const config: ProjectConfig = { buildTool: "maven", name: "test-app" };
        const service = new ProjectService(config);
        const originalCwd = process.cwd;
        process.cwd = () => tempDir;
        
        const expected = path.join(tempDir, "target");
        expect(service.getBuildOutputDir()).toBe(expected);
        
        process.cwd = originalCwd;
    });

    test("deve retornar o diretório de build correto para Gradle", () => {
        const config: ProjectConfig = { buildTool: "gradle", name: "test-app" };
        const service = new ProjectService(config);
        const originalCwd = process.cwd;
        process.cwd = () => tempDir;

        const expected = path.join(tempDir, "build");
        expect(service.getBuildOutputDir()).toBe(expected);

        process.cwd = originalCwd;
    });

    test("deve encontrar pastas de classes em estrutura Maven", () => {
        const config: ProjectConfig = { buildTool: "maven", name: "test-app" };
        const service = new ProjectService(config);
        
        const mavenClasses = path.join(tempDir, "target", "classes");
        mkdirSync(mavenClasses, { recursive: true });

        const originalCwd = process.cwd;
        process.cwd = () => tempDir;

        const results = service.findAllClassPaths();
        expect(results.some(p => p.includes("target/classes"))).toBe(true);

        process.cwd = originalCwd;
    });

    test("deve encontrar pastas de classes em estrutura Gradle", () => {
        const config: ProjectConfig = { buildTool: "gradle", name: "test-app" };
        const service = new ProjectService(config);
        
        const gradleClasses = path.join(tempDir, "subproject", "build", "classes", "java", "main");
        mkdirSync(gradleClasses, { recursive: true });

        const originalCwd = process.cwd;
        process.cwd = () => tempDir;

        const results = service.findAllClassPaths();
        expect(results.some(p => p.includes("build/classes/java/main"))).toBe(true);

        process.cwd = originalCwd;
    });

    test("deve encontrar o artefato .war mais recente", () => {
        const config: ProjectConfig = { buildTool: "maven", name: "test-app" };
        const service = new ProjectService(config);
        
        const targetDir = path.join(tempDir, "target");
        if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
        
        const oldWar = path.join(targetDir, "old.war");
        const newWar = path.join(targetDir, "new.war");
        
        writeFileSync(oldWar, "old");
        // Esperar um pouco para garantir diferença de tempo se necessário, 
        // mas aqui vamos apenas confiar na ordem se criarmos em sequência e o FS for rápido
        writeFileSync(newWar, "new");

        const originalCwd = process.cwd;
        process.cwd = () => tempDir;

        const artifact = service.getArtifact();
        expect(artifact.path).toContain("new.war");
        expect(artifact.isDirectory).toBe(false);

        process.cwd = originalCwd;
    });

    test("deve encontrar um war exploded (pasta com WEB-INF)", () => {
        const config: ProjectConfig = { buildTool: "maven", name: "test-app" };
        const service = new ProjectService(config);
        
        const explodedDir = path.join(tempDir, "target", "exploded-war");
        mkdirSync(path.join(explodedDir, "WEB-INF"), { recursive: true });

        const originalCwd = process.cwd;
        process.cwd = () => tempDir;

        const artifact = service.getArtifact();
        expect(artifact.path).toContain("exploded-war");
        expect(artifact.isDirectory).toBe(true);

        process.cwd = originalCwd;
    });
});
