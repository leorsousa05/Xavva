import { expect, test, describe, mock, spyOn, beforeEach } from "bun:test";
import { BuildCommand } from "../src/commands/BuildCommand";
import { BuildService } from "../src/services/BuildService";
import { ProcessExitError } from "../src/utils/processManager";
import type { AppConfig } from "../src/types/config";

// Mock do Logger do novo sistema
mock.module("../src/logging", () => ({
    Logger: {
        getInstance: () => ({
            section: mock(() => {}),
            config: mock(() => {}),
            info: mock(() => {}),
            success: mock(() => {}),
            error: mock(() => {}),
            warn: mock(() => {}),
            debug: mock(() => {}),
        })
    }
}));

// Mock do ProcessManager para evitar registro de handlers de sinal
mock.module("../src/utils/processManager", () => ({
    ProcessManager: {
        getInstance: () => ({
            shutdown: async (code: number) => {
                throw new ProcessExitError(code as any);
            },
            setExitCode: () => {},
            getExitCode: () => 0,
            onShutdown: () => () => {}
        })
    },
    ProcessExitError: class ProcessExitError extends Error {
        constructor(public readonly code: number) {
            super(`Process exited with code ${code}`);
            this.name = 'ProcessExitError';
        }
    }
}));

describe("BuildCommand", () => {
    let mockBuildService: BuildService;
    let buildCommand: BuildCommand;
    let mockConfig: AppConfig;

    beforeEach(() => {
        // We can use a simplified mock of BuildService
        mockBuildService = {
            runBuild: mock(() => Promise.resolve())
        } as unknown as BuildService;
        
        buildCommand = new BuildCommand(mockBuildService);
        mockConfig = {
            project: { buildTool: "maven", profile: "prod" }
        } as AppConfig;
    });

    test("deve executar o build com sucesso e logar mensagens", async () => {
        await buildCommand.execute(mockConfig);

        expect(mockBuildService.runBuild).toHaveBeenCalled();
    });

    test("deve capturar erro do build e encerrar o processo com código 1", async () => {
        const buildError = new Error("Build Failed!");
        (mockBuildService.runBuild as any).mockReturnValue(Promise.reject(buildError));

        try {
            await buildCommand.execute(mockConfig);
            expect(false).toBe(true); // Não deveria chegar aqui
        } catch (e) {
            expect(e).toBeInstanceOf(ProcessExitError);
            expect((e as ProcessExitError).code).toBe(1);
        }
    });
});
