import { expect, test, describe, spyOn, mock } from "bun:test";
import { CommandRegistry } from "../src/commands/CommandRegistry";
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
        const exitSpy = spyOn(process, "exit").mockImplementation((code?: number | string | null | undefined): never => {
            throw new Error(`Exit called with ${code}`);
        });

        const config = {} as AppConfig;
        const args = {} as CLIArguments;

        try {
            await registry.execute("unknown", config, args);
        } catch (e: any) {
            expect(e.message).toBe("Exit called with 1");
        }

        expect(exitSpy).toHaveBeenCalled();
        exitSpy.mockRestore();
    });
});
