import { expect, test, describe, spyOn, mock } from "bun:test";
import { CommandRegistry } from "../src/commands/CommandRegistry";
import { ProcessExitError } from "../src/utils/processManager";
import type { Command } from "../src/commands/Command";
import type { AppConfig, CLIArguments } from "../src/types/config";

// Mock do Logger para não sujar o output dos testes
mock.module("../src/utils/ui", () => ({
    Logger: {
        error: () => {},
        log: () => {},
        banner: () => {}
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

describe("CommandRegistry", () => {
    test("deve registrar e recuperar um comando", () => {
        const registry = new CommandRegistry();
        const mockCommand: Command = {
            execute: async () => {}
        };

        registry.register("test", mockCommand);
        expect(registry.has("test")).toBe(true);
        expect(registry.get("test")).toBe(mockCommand);
    });

    test("deve retornar false para comando não registrado", () => {
        const registry = new CommandRegistry();
        expect(registry.has("unknown")).toBe(false);
    });

    test("deve executar um comando registrado com os argumentos corretos", async () => {
        const registry = new CommandRegistry();
        const mockExecute = spyOn({ execute: async (config: any, args: any) => {} }, "execute");
        const mockCommand: Command = { execute: mockExecute };

        registry.register("test", mockCommand);
        
        const config = { project: { buildTool: "maven" } } as AppConfig;
        const args = { watch: true } as CLIArguments;

        await registry.execute("test", config, args);

        expect(mockExecute).toHaveBeenCalledWith(config, args);
    });

    test("deve tratar comando inexistente chamando o Help e saindo", async () => {
        const registry = new CommandRegistry();

        const config = {} as AppConfig;
        const args = {} as CLIArguments;

        await expect(registry.execute("unknown", config, args))
            .rejects
            .toThrow(ProcessExitError);
    });
});
