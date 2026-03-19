import { describe, test, expect } from "bun:test";
import {
    XavvaError,
    BuildError,
    DeployError,
    TomcatError,
    ConfigError,
    NetworkError,
    isOperationalError,
    getExitCode,
} from "../src/errors/XavvaError";

describe("XavvaError", () => {
    test("deve criar erro base com valores padrão", () => {
        const error = new XavvaError("Mensagem de erro");
        expect(error.message).toBe("Mensagem de erro");
        expect(error.code).toBe("XAVVA_ERROR");
        expect(error.exitCode).toBe(1);
        expect(error.isOperational).toBe(true);
    });

    test("deve criar BuildError com código específico", () => {
        const error = new BuildError("Falha na compilação");
        expect(error.message).toBe("Falha na compilação");
        expect(error.code).toBe("BUILD_ERROR");
        expect(error.exitCode).toBe(3);
    });

    test("deve criar DeployError com detalhes", () => {
        const error = new DeployError("Falha no deploy", "Artefato não encontrado");
        expect(error.message).toBe("Falha no deploy: Artefato não encontrado");
        expect(error.code).toBe("DEPLOY_ERROR");
        expect(error.exitCode).toBe(4);
    });

    test("deve criar TomcatError", () => {
        const error = new TomcatError("Porta em uso", "8080");
        expect(error.message).toContain("Porta em uso");
        expect(error.code).toBe("TOMCAT_ERROR");
    });

    test("deve criar ConfigError", () => {
        const error = new ConfigError("Configuração inválida");
        expect(error.code).toBe("CONFIG_ERROR");
        expect(error.exitCode).toBe(2);
    });

    test("deve criar NetworkError", () => {
        const originalError = new Error("Connection refused");
        const error = new NetworkError("https://example.com", originalError);
        expect(error.message).toContain("https://example.com");
        expect(error.code).toBe("NETWORK_ERROR");
    });

    test("isOperationalError deve retornar true para XavvaError", () => {
        const error = new XavvaError("Erro operacional");
        expect(isOperationalError(error)).toBe(true);
    });

    test("isOperationalError deve retornar false para Error genérico", () => {
        const error = new Error("Erro genérico");
        expect(isOperationalError(error)).toBe(false);
    });

    test("getExitCode deve retornar exit code do XavvaError", () => {
        const error = new BuildError("Erro");
        expect(getExitCode(error)).toBe(3);
    });

    test("getExitCode deve retornar 1 para Error genérico", () => {
        const error = new Error("Erro");
        expect(getExitCode(error)).toBe(1);
    });
});
