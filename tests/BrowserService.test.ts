import { expect, test, describe, mock, spyOn, beforeEach, afterEach } from "bun:test";
import { BrowserService } from "../src/services/BrowserService";

mock.module("../src/utils/ui", () => ({
    Logger: {
        warn: mock(() => {})
    }
}));

describe("BrowserService", () => {
    let originalPlatform: PropertyDescriptor | undefined;
    let spawnSpy: any;

    beforeEach(() => {
        // Salvar platform original
        originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
        spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => ({}) as any);
    });

    afterEach(() => {
        // Restaurar platform
        if (originalPlatform) {
            Object.defineProperty(process, 'platform', originalPlatform);
        }
        spawnSpy.mockRestore();
    });

    test("deve retornar imediatamente em plataforma não-Windows (reload)", async () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        
        await BrowserService.reload("http://localhost:8080/app");
        
        // Não deve chamar Bun.spawn em Linux
        expect(spawnSpy).not.toHaveBeenCalled();
    });

    test("deve chamar PowerShell para recarregar browser no Windows", async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        
        // Mock setTimeout para acelerar o teste
        const originalSetTimeout = global.setTimeout;
        global.setTimeout = ((cb: Function) => cb()) as any;
        
        await BrowserService.reload("http://localhost:8080/app");
        
        // Restaurar setTimeout
        global.setTimeout = originalSetTimeout;
        
        // Deve chamar Bun.spawn com PowerShell
        expect(spawnSpy).toHaveBeenCalled();
        const call = spawnSpy.mock.calls[0];
        expect(call[0][0]).toBe("powershell");
    });

    test("deve abrir URL com 'start' no Windows", () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        
        BrowserService.open("http://localhost:8080/app");
        
        expect(spawnSpy).toHaveBeenCalledWith(["cmd", "/c", "start", "http://localhost:8080/app"]);
    });

    test("deve abrir URL com 'open' no macOS", () => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
        
        BrowserService.open("http://localhost:8080/app");
        
        expect(spawnSpy).toHaveBeenCalledWith(["open", "http://localhost:8080/app"]);
    });

    test("deve abrir URL com 'xdg-open' no Linux", () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        
        BrowserService.open("http://localhost:8080/app");
        
        expect(spawnSpy).toHaveBeenCalledWith(["xdg-open", "http://localhost:8080/app"]);
    });
});
