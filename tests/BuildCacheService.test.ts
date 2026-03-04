import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { BuildCacheService } from "../src/services/BuildCacheService";
import { existsSync, mkdirSync, rmdirSync, writeFileSync, unlinkSync } from "fs";
import path from "path";

describe("BuildCacheService", () => {
    let service: BuildCacheService;
    const testDir = path.join(process.cwd(), ".xavva-test-cache");
    const originalCwd = process.cwd;

    beforeEach(() => {
        // Mock process.cwd para usar diretório temporário
        process.cwd = () => testDir;
        
        // Criar estrutura de teste
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
        
        service = new BuildCacheService();
    });

    afterEach(() => {
        // Limpar arquivos de teste
        const cacheFile = path.join(testDir, ".xavva", "build-cache.json");
        if (existsSync(cacheFile)) {
            unlinkSync(cacheFile);
        }
        
        const xavvaDir = path.join(testDir, ".xavva");
        if (existsSync(xavvaDir)) {
            rmdirSync(xavvaDir);
        }
        
        const pomFile = path.join(testDir, "pom.xml");
        if (existsSync(pomFile)) {
            unlinkSync(pomFile);
        }
        
        const gradleFile = path.join(testDir, "build.gradle");
        if (existsSync(gradleFile)) {
            unlinkSync(gradleFile);
        }
        
        // Restaurar process.cwd
        process.cwd = originalCwd;
    });

    test("deve retornar true para rebuild quando não há cache", () => {
        const result = service.shouldRebuild("maven");
        expect(result).toBe(true);
    });

    test("deve calcular hash MD5 de arquivo", () => {
        const testFile = path.join(testDir, "test.txt");
        writeFileSync(testFile, "conteudo de teste");
        
        const hash = service.getHash(testFile);
        expect(hash).toBeTruthy();
        expect(hash.length).toBe(32); // MD5 tem 32 caracteres hex
        
        unlinkSync(testFile);
    });

    test("deve retornar string vazia para arquivo inexistente", () => {
        const hash = service.getHash(path.join(testDir, "nao-existe.txt"));
        expect(hash).toBe("");
    });

    test("deve detectar mudança no pom.xml e requerer rebuild", () => {
        // Criar pom.xml inicial
        const pomPath = path.join(testDir, "pom.xml");
        writeFileSync(pomPath, "<project><version>1.0</version></project>");
        
        // Salvar cache
        service.saveCache("maven");
        
        // Verificar que não precisa de rebuild
        const shouldRebuild1 = service.shouldRebuild("maven");
        expect(shouldRebuild1).toBe(false);
        
        // Modificar pom.xml
        writeFileSync(pomPath, "<project><version>2.0</version></project>");
        
        // Agora deve requerer rebuild
        const shouldRebuild2 = service.shouldRebuild("maven");
        expect(shouldRebuild2).toBe(true);
    });

    test("deve calcular hash de configuração Maven corretamente", () => {
        const pomPath = path.join(testDir, "pom.xml");
        writeFileSync(pomPath, "<project></project>");
        
        const hash1 = service.getConfigHash("maven");
        const hash2 = service.getConfigHash("maven");
        
        // Mesmo conteúdo deve gerar mesmo hash
        expect(hash1).toBe(hash2);
        expect(hash1.length).toBe(32);
    });

    test("deve calcular hash de configuração Gradle considerando múltiplos arquivos", () => {
        const gradlePath = path.join(testDir, "build.gradle");
        
        writeFileSync(gradlePath, "plugins { id 'java' }");
        
        const hash1 = service.getConfigHash("gradle");
        
        // Modificar arquivo build.gradle
        writeFileSync(gradlePath, "plugins { id 'java' id 'war' }");
        
        const hash2 = service.getConfigHash("gradle");
        
        // Hashes devem ser diferentes após modificação
        expect(hash1).not.toBe(hash2);
    });

    test("deve limpar cache corretamente", () => {
        // Criar e salvar cache
        const pomPath = path.join(testDir, "pom.xml");
        writeFileSync(pomPath, "<project></project>");
        service.saveCache("maven");
        
        // Verificar que cache existe
        const cacheFile = path.join(testDir, ".xavva", "build-cache.json");
        expect(existsSync(cacheFile)).toBe(true);
        
        // Limpar cache
        service.clearCache();
        
        // Verificar que cache foi removido
        expect(existsSync(cacheFile)).toBe(false);
    });

    test("deve salvar timestamp no cache", () => {
        const pomPath = path.join(testDir, "pom.xml");
        writeFileSync(pomPath, "<project></project>");
        
        const beforeSave = Date.now();
        service.saveCache("maven");
        const afterSave = Date.now();
        
        const cacheFile = path.join(testDir, ".xavva", "build-cache.json");
        const cacheContent = require("fs").readFileSync(cacheFile, "utf-8");
        const cache = JSON.parse(cacheContent);
        
        expect(cache.lastBuildTime).toBeGreaterThanOrEqual(beforeSave);
        expect(cache.lastBuildTime).toBeLessThanOrEqual(afterSave);
        expect(cache.lastConfigHash).toBeTruthy();
    });
});
