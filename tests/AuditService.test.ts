import { expect, test, describe, mock, spyOn, beforeEach, afterEach } from "bun:test";
import { AuditService, type JarAuditResult } from "../src/services/AuditService";
import type { TomcatConfig } from "../src/types/config";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "fs";
import path from "path";

mock.module("../src/utils/ui", () => ({
    Logger: {
        spinner: () => () => {},
        log: () => {},
        success: () => {},
        warn: () => {},
        error: () => {}
    }
}));

describe("AuditService", { timeout: 10000 }, () => {
    let service: AuditService;
    const testDir = path.join(process.cwd(), "test-audit-temp");
    const webappsDir = path.join(testDir, "webapps", "test-app", "WEB-INF", "lib");
    const originalFetch = global.fetch;

    const mockConfig: TomcatConfig = {
        path: testDir,
        port: 8080,
        webapps: "webapps"
    };

    beforeEach(() => {
        // Criar estrutura de diretórios de teste
        if (!existsSync(webappsDir)) {
            mkdirSync(webappsDir, { recursive: true });
        }

        service = new AuditService(mockConfig);
    });

    afterEach(() => {
        // Limpar arquivos de teste
        if (existsSync(testDir)) {
            const cleanDir = (dir: string) => {
                const entries = require("fs").readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        cleanDir(fullPath);
                        rmdirSync(fullPath);
                    } else {
                        unlinkSync(fullPath);
                    }
                }
            };
            cleanDir(testDir);
            rmdirSync(testDir);
        }

        // Restaurar fetch
        global.fetch = originalFetch;
    });

    test("deve lançar erro quando pasta lib não existe", async () => {
        const invalidConfig: TomcatConfig = {
            path: path.join(testDir, "nao-existe"),
            port: 8080,
            webapps: "webapps"
        };
        const invalidService = new AuditService(invalidConfig);

        await expect(invalidService.runAudit("test-app")).rejects.toThrow("Pasta lib não encontrada");
    });

    test("deve retornar array vazio quando não há JARs", async () => {
        // Pasta lib existe mas está vazia
        const results = await service.runAudit("test-app");
        expect(results).toEqual([]);
    });

    test("deve extrair informações do nome do JAR", async () => {
        // Criar um arquivo JAR fake
        const jarPath = path.join(webappsDir, "spring-core-5.3.9.jar");
        writeFileSync(jarPath, "fake jar content");

        // Mock do fetch para OSV API
        global.fetch = () => Promise.resolve({
            json: () => Promise.resolve({ vulns: [] })
        } as Response);

        const results = await service.runAudit("test-app");

        expect(results.length).toBe(1);
        expect(results[0].jarName).toBe("spring-core-5.3.9.jar");
        expect(results[0].artifactId).toBe("spring-core");
        expect(results[0].version).toBe("5.3.9");

        unlinkSync(jarPath);
    });

    test("deve processar vulnerabilidades da OSV API", async () => {
        const jarPath = path.join(webappsDir, "log4j-core-2.14.0.jar");
        writeFileSync(jarPath, "fake jar content");

        // Mock do fetch retornando vulnerabilidades
        global.fetch = () => Promise.resolve({
            json: () => Promise.resolve({
                vulns: [{
                    id: "CVE-2021-44228",
                    summary: "Log4Shell vulnerability",
                    details: "Critical vulnerability in Log4j2",
                    affected: [{
                        ranges: [{
                            events: [{ fixed: "2.15.0" }]
                        }]
                    }],
                    database_specific: { severity: "CRITICAL" }
                }]
            })
        } as Response);

        const results = await service.runAudit("test-app");

        expect(results[0].vulnerabilities.length).toBe(1);
        expect(results[0].vulnerabilities[0].id).toBe("CVE-2021-44228");
        expect(results[0].vulnerabilities[0].severity).toBe("CRITICAL");
        expect(results[0].vulnerabilities[0].fixedIn).toBe("2.15.0");

        unlinkSync(jarPath);
    });

    test("deve retornar UNKNOWN para severidade não identificada", async () => {
        const jarPath = path.join(webappsDir, "some-lib-1.0.jar");
        writeFileSync(jarPath, "fake jar content");

        global.fetch = () => Promise.resolve({
            json: () => Promise.resolve({
                vulns: [{
                    id: "CVE-2023-XXXXX",
                    summary: "Some vulnerability",
                    details: "Unknown severity issue",
                    affected: []
                }]
            })
        } as Response);

        const results = await service.runAudit("test-app");

        expect(results[0].vulnerabilities[0].severity).toBe("UNKNOWN");

        unlinkSync(jarPath);
    });

    test("deve extrair severidade do texto quando disponível", async () => {
        const jarPath = path.join(webappsDir, "lib-1.0.jar");
        writeFileSync(jarPath, "fake jar content");

        global.fetch = () => Promise.resolve({
            json: () => Promise.resolve({
                vulns: [{
                    id: "GHSA-XXXX",
                    summary: "High severity issue",
                    details: "This is a HIGH severity vulnerability",
                    advisories: [{ url: "https://github.com/advisories/XXXX" }],
                    affected: []
                }]
            })
        } as Response);

        const results = await service.runAudit("test-app");

        expect(results[0].vulnerabilities[0].severity).toBe("HIGH");

        unlinkSync(jarPath);
    });

    test("deve lidar com erro na API OSV", async () => {
        const jarPath = path.join(webappsDir, "failing-lib-1.0.jar");
        writeFileSync(jarPath, "fake jar content");

        global.fetch = () => Promise.reject(new Error("Network error"));

        const results = await service.runAudit("test-app");

        // Deve retornar resultado com array de vulnerabilidades vazio
        expect(results.length).toBe(1);
        expect(results[0].vulnerabilities).toEqual([]);

        unlinkSync(jarPath);
    });

    test("deve processar múltiplos JARs em chunks", async () => {
        // Criar 15 JARs para testar chunking (chunkSize = 10)
        for (let i = 0; i < 15; i++) {
            writeFileSync(path.join(webappsDir, `lib-${i}-1.0.jar`), "fake");
        }

        let fetchCount = 0;
        global.fetch = () => {
            fetchCount++;
            return Promise.resolve({
                json: () => Promise.resolve({ vulns: [] })
            } as Response);
        };

        const results = await service.runAudit("test-app");

        expect(results.length).toBe(15);
        expect(fetchCount).toBe(15); // Um fetch por JAR

        // Limpar
        for (let i = 0; i < 15; i++) {
            unlinkSync(path.join(webappsDir, `lib-${i}-1.0.jar`));
        }
    });
});
