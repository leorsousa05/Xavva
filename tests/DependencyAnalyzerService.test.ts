import { expect, test, describe, mock, beforeEach, afterEach } from "bun:test";
import { DependencyAnalyzerService, type Dependency } from "../src/services/DependencyAnalyzerService";
import type { ProjectConfig } from "../src/types/config";
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from "fs";
import path from "path";

mock.module("../src/utils/ui", () => ({
    Logger: {
        warn: mock(() => {}),
        log: mock(() => {}),
        section: mock(() => {}),
        info: mock(() => {}),
        success: mock(() => {}),
        spinner: () => () => {},
        C: {
            reset: "\x1b[0m",
            cyan: "\x1b[36m",
            green: "\x1b[32m",
            yellow: "\x1b[33m",
            red: "\x1b[31m",
            dim: "\x1b[90m",
            bold: "\x1b[1m"
        }
    }
}));

describe("DependencyAnalyzerService", () => {
    let service: DependencyAnalyzerService;
    const testDir = path.join(process.cwd(), "test-deps-analysis");
    const originalCwd = process.cwd;

    const mockConfig: ProjectConfig = {
        appName: "test-app",
        buildTool: "maven",
        profile: "",
        skipBuild: false,
        skipScan: true,
        clean: false,
        quiet: true,
        verbose: false,
        debug: false,
        debugPort: 5005,
        cleanLogs: true,
        tui: false
    };

    beforeEach(() => {
        process.cwd = () => testDir;
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
        service = new DependencyAnalyzerService(mockConfig);
    });

    afterEach(() => {
        process.cwd = originalCwd;
        // Cleanup
        if (existsSync(testDir)) {
            const files = ["pom.xml", "build.gradle"];
            for (const f of files) {
                const fp = path.join(testDir, f);
                if (existsSync(fp)) unlinkSync(fp);
            }
            rmdirSync(testDir, { recursive: true } as any);
        }
    });

    test("deve retornar array vazio quando não há arquivo de configuração", async () => {
        const deps = await (service as any).extractDependencies();
        expect(deps).toEqual([]);
    });

    test("deve parsear pom.xml corretamente", async () => {
        const pomContent = `<?xml version="1.0"?>
<project>
    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-core</artifactId>
            <version>5.3.9</version>
        </dependency>
        <dependency>
            <groupId>junit</groupId>
            <artifactId>junit</artifactId>
            <version>4.13.2</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
</project>`;
        writeFileSync(path.join(testDir, "pom.xml"), pomContent);

        const deps = await (service as any).parsePomDirect();
        
        expect(deps.length).toBe(2);
        expect(deps[0].groupId).toBe("org.springframework");
        expect(deps[0].artifactId).toBe("spring-core");
        expect(deps[0].version).toBe("5.3.9");
        expect(deps[0].type).toBe("direct");
        
        expect(deps[1].scope).toBe("test");
    });

    test("deve detectar conflitos de versão", () => {
        const deps: Dependency[] = [
            { groupId: "org.springframework", artifactId: "spring-core", version: "5.3.9", type: "direct" },
            { groupId: "org.springframework", artifactId: "spring-core", version: "5.2.8", type: "transitive" },
            { groupId: "org.springframework", artifactId: "spring-context", version: "5.3.9", type: "direct" }
        ];

        const conflicts = (service as any).detectConflicts(deps);
        
        expect(conflicts.length).toBe(1);
        expect(conflicts[0].groupId).toBe("org.springframework");
        expect(conflicts[0].artifactId).toBe("spring-core");
        expect(conflicts[0].versions).toContain("5.3.9");
        expect(conflicts[0].versions).toContain("5.2.8");
        expect(conflicts[0].severity).toBe("error"); // Porque é direta
    });

    test("deve comparar versões corretamente", () => {
        const cmp = (service as any).compareVersions.bind(service);
        
        expect(cmp("1.0.0", "1.0.0")).toBe(0);
        expect(cmp("2.0.0", "1.0.0")).toBeGreaterThan(0);
        expect(cmp("1.0.0", "2.0.0")).toBeLessThan(0);
        expect(cmp("1.10.0", "1.9.0")).toBeGreaterThan(0);
    });

    test("deve identificar atualização major", () => {
        const isMajor = (service as any).isMajorUpdate.bind(service);
        
        expect(isMajor("1.0.0", "2.0.0")).toBe(true);
        expect(isMajor("1.0.0", "1.1.0")).toBe(false);
        expect(isMajor("1.0.0", "1.0.1")).toBe(false);
    });

    test("deve gerar relatório vazio quando não há problemas", () => {
        const result = {
            dependencies: [],
            conflicts: [],
            updates: [],
            outdated: [],
            stats: { total: 0, direct: 0, transitive: 0, vulnerable: 0, outdatedCount: 0 }
        };

        const report = service.generateReport(result as any);
        
        expect(report).toContain("ANÁLISE DE DEPENDÊNCIAS");
        expect(report).toContain("Todas as dependências estão atualizadas");
    });

    test("deve gerar relatório com conflitos", () => {
        const result = {
            dependencies: [
                { groupId: "org.example", artifactId: "lib", version: "1.0", type: "direct" },
                { groupId: "org.example", artifactId: "lib", version: "2.0", type: "transitive" }
            ],
            conflicts: [{
                groupId: "org.example",
                artifactId: "lib",
                versions: ["1.0", "2.0"],
                locations: ["compile", "runtime"],
                severity: "error" as const
            }],
            updates: [],
            outdated: [],
            stats: { total: 2, direct: 1, transitive: 1, vulnerable: 0, outdatedCount: 0 }
        };

        const report = service.generateReport(result as any);
        
        expect(report).toContain("CONFLITOS DE VERSÃO");
        expect(report).toContain("org.example:lib");
        expect(report).toContain("1.0, 2.0");
    });

    test("deve parsear Maven tree output", () => {
        const output = `[INFO] com.example:my-app:jar:1.0-SNAPSHOT
[INFO] +- org.springframework:spring-core:jar:5.3.9:compile
[INFO] |  \- org.springframework:spring-jcl:jar:5.3.9:compile
[INFO] \- junit:junit:jar:4.13.2:test`;

        const deps = (service as any).parseMavenTree(output);
        
        expect(deps.length).toBe(3);
        // Verifica se as dependências foram parseadas
        expect(deps[0].artifactId).toBe("spring-core");
        expect(deps[1].artifactId).toBe("spring-jcl");
        expect(deps[2].artifactId).toBe("junit");
        // Verifica tipos (nível 0/1 = direct, nível > 1 = transitive)
        expect(deps[0].type).toBe("direct");  // +- (nível 0)
        expect(deps[2].type).toBe("direct");  // \- (nível 0)
    });

    test("deve deduplicar dependências no parse", () => {
        const output = `[INFO] +- org.example:lib:jar:1.0:compile
[INFO] +- org.example:lib:jar:1.0:compile
[INFO] \- org.example:lib:jar:1.0:compile`;

        const deps = (service as any).parseMavenTree(output);
        
        expect(deps.length).toBe(1); // Deve deduplicar
    });
});
