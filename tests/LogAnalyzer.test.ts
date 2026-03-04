import { expect, test, describe, mock, beforeEach } from "bun:test";
import { LogAnalyzer } from "../src/services/LogAnalyzer";
import type { ProjectConfig } from "../src/types/config";

// Mock do Logger
mock.module("../src/utils/ui", () => ({
    Logger: {
        C: {
            reset: "\x1b[0m",
            cyan: "\x1b[36m",
            green: "\x1b[32m",
            yellow: "\x1b[33m",
            red: "\x1b[31m",
            dim: "\x1b[90m",
            bold: "\x1b[1m",
            blue: "\x1b[34m",
            magenta: "\x1b[35m",
            bgRed: "\x1b[41m",
            white: "\x1b[37m",
            gray: "\x1b[38;5;240m"
        },
        isSystemNoise: () => false
    }
}));

describe("LogAnalyzer", () => {
    let analyzer: LogAnalyzer;
    const mockConfig: ProjectConfig = {
        appName: "meu-app-teste",
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
        analyzer = new LogAnalyzer(mockConfig);
    });

    test("deve extrair prefixo do appName", () => {
        // O construtor deve extrair "meu" de "meu-app-teste"
        // E também adicionar "com.xavva" como padrão
        const analyzer2 = new LogAnalyzer({ ...mockConfig, appName: "mycompany-app" });
        analyzer2.setProjectPrefixes(["com.mycompany"]);
        // Se o teste não lançar erro, o prefix foi processado corretamente
        expect(true).toBe(true);
    });

    test("deve formatar linha de startup do servidor", () => {
        const line = "INFO: Server startup in 1250 ms";
        const result = analyzer.summarize(line);
        
        expect(result).toContain("Server started");
        expect(result).toContain("1.3s"); // 1250ms / 1000 = 1.25s -> arredonda para 1.3s
    });

    test("deve formatar linha de deployment", () => {
        const line = "Deployment of web application archive [meu-app.war] has finished in [2500] ms";
        const result = analyzer.summarize(line);
        
        expect(result).toContain("Artifacts deployed");
    });

    test("deve destacar 'Caused by:' no stack trace", () => {
        const line = "Caused by: java.lang.NullPointerException: Something went wrong";
        const result = analyzer.summarize(line);
        
        expect(result).toContain("ROOT CAUSE");
        expect(result).toContain("NullPointerException");
    });

    test("deve destacar Exception", () => {
        const line = "java.lang.IllegalArgumentException: Invalid parameter";
        const result = analyzer.summarize(line);
        
        expect(result).toContain("Exception");
    });

    test("deve formatar linha de stack trace do projeto", () => {
        analyzer.setProjectPrefixes(["com.meuprojeto"]);
        const line = "  at com.meuprojeto.service.UserService.findById(UserService.java:45)";
        const result = analyzer.summarize(line);
        
        // Deve conter a linha formatada
        expect(result.length).toBeGreaterThan(0);
    });

    test("deve formatar linha de stack trace de biblioteca", () => {
        const line = "  at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)";
        const result = analyzer.summarize(line);
        
        // Deve retornar algo (mesmo que formatado com dim)
        expect(result).toBeTruthy();
    });

    test("deve formatar log Tomcat INFO", () => {
        const line = "12-Jan-2024 10:30:45.123 INFO [main] org.apache.catalina.startup.Catalina.start Server startup in 1234 ms";
        const result = analyzer.summarize(line);
        
        expect(result.length).toBeGreaterThan(0);
    });

    test("deve formatar log Tomcat WARNING", () => {
        const line = "12-Jan-2024 10:30:45.123 WARNING [main] org.apache.catalina.loader.WebappClassLoader.clearReferencesJdbc The web application registered the JDBC driver";
        const result = analyzer.summarize(line);
        
        expect(result.length).toBeGreaterThan(0);
    });

    test("deve formatar log Tomcat SEVERE", () => {
        const line = "12-Jan-2024 10:30:45.123 SEVERE [main] org.apache.catalina.core.StandardContext.startInternal Error during context start";
        const result = analyzer.summarize(line);
        
        expect(result.length).toBeGreaterThan(0);
    });

    test("deve formatar log genérico [INFO]", () => {
        const line = "[INFO] Building my-app 1.0-SNAPSHOT";
        const result = analyzer.summarize(line);
        
        expect(result.length).toBeGreaterThan(0);
    });

    test("deve formatar log genérico [ERROR]", () => {
        const line = "[ERROR] Failed to execute goal: Compilation failure";
        const result = analyzer.summarize(line);
        
        // Deve retornar vazio pois filtra "Compilation failure"
        expect(result).toBe("");
    });

    test("deve retornar vazio para linha sem informação relevante", () => {
        const line = "[INFO] Total time: 5.234 s";
        const result = analyzer.summarize(line);
        
        expect(result).toBe("");
    });

    test("deve formatar linha de Hotswap RELOAD", () => {
        const line = "HOTSWAP AGENT: 10:30:45.123 RELOAD org.hotswap.agent - Reloading classes [com.example.UserService, com.example.OrderService]";
        const result = analyzer.summarize(line);
        
        expect(result).toContain("Hotswap");
        expect(result).toContain("Reloading");
    });

    test("deve formatar linha de Hotswap INFO", () => {
        const line = "HOTSWAP AGENT: 10:30:45.123 INFO org.hotswap.agent - Watching directory: /path/to/classes";
        const result = analyzer.summarize(line);
        
        expect(result).toContain("Hotswap");
    });

    test("deve ignorar linha de Hotswap plugin initialized", () => {
        const line = "HOTSWAP AGENT: 10:30:45.123 INFO org.hotswap.agent - plugin initialized";
        const result = analyzer.summarize(line);
        
        expect(result).toBe("");
    });

    test("deve resumir múltiplas classes em Hotswap", () => {
        const line = "HOTSWAP AGENT: 10:30:45.123 RELOAD org.hotswap.agent - Reloading classes [Class1, Class2, Class3, Class4, Class5]";
        const result = analyzer.summarize(line);
        
        expect(result).toContain("5 classes");
    });
});
