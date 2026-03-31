import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { FileWatcher } from "../src/services/FileWatcher";

// Mock Logger para evitar output no console
mock.module("../src/utils/ui", () => ({
    Logger: {
        debug: () => {},
        log: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
    }
}));

describe("FileWatcher", () => {
    let watcher: FileWatcher;

    beforeEach(() => {
        watcher = new FileWatcher({
            debounceMs: 50,
            coolingMs: 100,
        });
    });

    afterEach(() => {
        watcher.stop();
    });

    describe("matchesPattern", () => {
        test("deve fazer match com pattern regex /\\.java$/", () => {
            const handler = mock(() => {});
            const unsubscribe = watcher.on(/\.java$/, handler);
            
            // Simula o evento de mudança chamando o método interno via notifyHandlers
            // @ts-ignore - acessando método privado para teste
            watcher["notifyHandlers"]({
                eventType: "change",
                filename: "Test.java",
                fullPath: "/src/Test.java"
            });

            // Aguarda o debounce
            return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
                expect(handler).toHaveBeenCalled();
                unsubscribe();
            });
        });

        test("deve fazer match com pattern regex para múltiplas extensões", () => {
            const handler = mock(() => {});
            const unsubscribe = watcher.on(/\.(jsp|html|css)$/, handler);
            
            // @ts-ignore
            watcher["notifyHandlers"]({
                eventType: "change",
                filename: "index.html",
                fullPath: "/src/index.html"
            });

            return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
                expect(handler).toHaveBeenCalled();
                unsubscribe();
            });
        });

        test("deve fazer match com pattern string exato", () => {
            const handler = mock(() => {});
            const unsubscribe = watcher.on("pom.xml", handler);
            
            // @ts-ignore
            watcher["notifyHandlers"]({
                eventType: "change",
                filename: "pom.xml",
                fullPath: "/pom.xml"
            });

            return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
                expect(handler).toHaveBeenCalled();
                unsubscribe();
            });
        });

        test("não deve fazer match quando extensão não corresponde", () => {
            const handler = mock(() => {});
            const unsubscribe = watcher.on(/\.java$/, handler);
            
            // @ts-ignore
            watcher["notifyHandlers"]({
                eventType: "change",
                filename: "test.txt",
                fullPath: "/src/test.txt"
            });

            return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
                expect(handler).not.toHaveBeenCalled();
                unsubscribe();
            });
        });
    });
});
