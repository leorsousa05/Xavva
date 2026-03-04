import { expect, test, describe, mock, spyOn, beforeEach, afterEach } from "bun:test";
import { BuildService } from "../src/services/BuildService";
import { ProjectService } from "../src/services/ProjectService";
import { BuildCacheService } from "../src/services/BuildCacheService";
import type { ProjectConfig, TomcatConfig } from "../src/types/config";
import { Logger } from "../src/utils/ui";

// Mocking Logger to avoid noise
mock.module("../src/utils/ui", () => ({
    Logger: {
        success: mock(() => {}),
        error: mock(() => {}),
        warn: mock(() => {}),
        log: mock(() => {}),
        spinner: mock(() => (() => {}))
    }
}));

describe("BuildService", () => {
    let projectConfig: ProjectConfig;
    let tomcatConfig: TomcatConfig;
    let projectService: ProjectService;
    let cacheService: BuildCacheService;
    let buildService: BuildService;

    beforeEach(() => {
        projectConfig = { buildTool: "maven", name: "test-app" } as ProjectConfig;
        tomcatConfig = { path: "/opt/tomcat", webapps: "/opt/tomcat/webapps" } as TomcatConfig;
        projectService = new ProjectService(projectConfig);
        cacheService = new BuildCacheService();
        buildService = new BuildService(projectConfig, tomcatConfig, projectService, cacheService);
        
        // Mock global Bun.spawn
        // Note: Bun.spawn is a global, mocking it requires careful handling
    });

    test("deve chamar maven com os argumentos corretos para build completo", async () => {
        const spawnSpy = spyOn(Bun, "spawn").mockImplementation((args: any) => {
            return {
                exited: Promise.resolve(0),
                exitCode: 0,
                stdout: new ReadableStream({
                    start(controller) {
                        controller.close();
                    }
                }),
                stderr: new ReadableStream({
                    start(controller) {
                        controller.close();
                    }
                })
            } as any;
        });

        await buildService.runBuild(false);

        expect(spawnSpy).toHaveBeenCalled();
        const callArgs = spawnSpy.mock.calls[0][0] as string[];
        expect(callArgs[0]).toMatch(/mvn/);
        expect(callArgs).toContain("compile");
        expect(callArgs).toContain("war:exploded");
        
        spawnSpy.mockRestore();
    });

    test("deve chamar gradle com os argumentos corretos para build incremental", async () => {
        projectConfig.buildTool = "gradle";
        buildService = new BuildService(projectConfig, tomcatConfig, projectService, cacheService);

        const spawnSpy = spyOn(Bun, "spawn").mockImplementation((args: any) => {
            return {
                exited: Promise.resolve(0),
                exitCode: 0,
                stdout: new ReadableStream({ start(c) { c.close(); } }),
                stderr: new ReadableStream({ start(c) { c.close(); } })
            } as any;
        });

        await buildService.runBuild(true);

        const callArgs = spawnSpy.mock.calls[0][0] as string[];
        expect(callArgs[0]).toMatch(/gradle/);
        expect(callArgs).toContain("classes");
        expect(callArgs).not.toContain("war");
        
        spawnSpy.mockRestore();
    });

    test("deve lançar erro se o processo de build falhar", async () => {
        const spawnSpy = spyOn(Bun, "spawn").mockImplementation((args: any) => {
            return {
                exited: Promise.resolve(1),
                exitCode: 1,
                stdout: new ReadableStream({ start(c) { c.close(); } }),
                stderr: new ReadableStream({ 
                    start(c) { 
                        c.enqueue(new TextEncoder().encode("Build Error Log"));
                        c.close(); 
                    } 
                })
            } as any;
        });

        await expect(buildService.runBuild(false)).rejects.toThrow("Falha no build do Java!");
        
        spawnSpy.mockRestore();
    });
});
