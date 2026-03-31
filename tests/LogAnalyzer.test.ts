import { expect, test, describe, beforeEach } from "bun:test";
import { LogAnalyzer } from "../src/services/LogAnalyzer";
import type { ProjectConfig } from "../src/types/config";

describe("LogAnalyzer", () => {
    let analyzer: LogAnalyzer;
    const mockConfig: ProjectConfig = {
        appName: "my-app",
        buildTool: "maven"
    } as ProjectConfig;

    beforeEach(() => {
        analyzer = new LogAnalyzer(mockConfig);
    });

    test("deve extrair prefixo do appName", () => {
        expect(analyzer["projectPrefixes"]).toContain("my");
    });

    test("deve formatar linha de startup do servidor", () => {
        const line = "INFO: Server startup in 1250 ms";
        const result = analyzer.summarize(line);

        expect(result).toContain("Servidor iniciado");
    });

    test("deve formatar linha de deployment", () => {
        const line = "Deployment of web application archive [meu-app.war] has finished in [2500] ms";
        const result = analyzer.summarize(line);

        expect(result).toContain("Artefatos implantados");
    });

    test("deve destacar 'Caused by:' no stack trace", () => {
        const line = "Caused by: java.lang.NullPointerException: Something went wrong";
        const result = analyzer.summarize(line);

        expect(result).toContain("CAUSA RAIZ");
    });

    test("deve destacar Exception", () => {
        const line = "java.lang.IllegalArgumentException: Invalid parameter";
        const result = analyzer.summarize(line);

        expect(result).toContain("Exception:");
    });

    test("deve formatar linha de stack trace do projeto", () => {
        analyzer.setProjectPrefixes(["com.mycompany"]);
        const line = "    at com.mycompany.service.MyService.process(MyService.java:42)";
        const result = analyzer.summarize(line);

        expect(result).toContain("at com.mycompany");
    });

    test("deve formatar linha de stack trace de biblioteca", () => {
        const line = "    at org.springframework.web.DispatcherServlet.doDispatch(DispatcherServlet.java:1038)";
        const result = analyzer.summarize(line);

        expect(result).toContain("at org.springframework");
    });

    test("deve formatar log Tomcat INFO", () => {
        const line = "12-Jan-2024 10:30:45.123 INFO [main] org.apache.catalina.startup.Catalina.start Server startup in 1234 ms";
        const result = analyzer.summarize(line);

        expect(result).toBeTruthy();
    });

    test("deve formatar log Tomcat WARNING", () => {
        const line = "12-Jan-2024 10:30:45.123 WARNING [main] org.apache.catalina.loader.WebappClassLoaderBase.clearReferencesJdbc";
        const result = analyzer.summarize(line);

        expect(result).toBeTruthy();
    });

    test("deve formatar log Tomcat SEVERE", () => {
        const line = "12-Jan-2024 10:30:45.123 SEVERE [main] org.apache.catalina.core.StandardContext.startInternal Error";
        const result = analyzer.summarize(line);

        expect(result).toContain("✖");
    });

    test("deve formatar log genérico [INFO]", () => {
        const line = "[INFO] Building my-project 1.0-SNAPSHOT";
        const result = analyzer.summarize(line);

        expect(result).toBeTruthy();
    });

    test("deve formatar log genérico [ERROR]", () => {
        const line = "[ERROR] Compilation failure";
        const result = analyzer.summarize(line);

        expect(result).toContain("✖");
    });

    test("deve retornar vazio para linha sem informação relevante", () => {
        const line = "Using CATALINA_OPTS: -Xmx512m";
        const result = analyzer.summarize(line);

        expect(result).toBe("");
    });

    test("deve formatar linha de Hotswap RELOAD", () => {
        const line = "HOTSWAP AGENT: 10:30:45.123 RELOAD (org.hotswap.agent) - Reloading classes [com.example.MyClass]";
        const result = analyzer.summarize(line);

        expect(result).toContain("Hotswap:");
    });

    test("deve formatar linha de Hotswap INFO", () => {
        const line = "HOTSWAP AGENT: 10:30:45.123 INFO (org.hotswap.agent) - Some info message";
        const result = analyzer.summarize(line);

        expect(result).toContain("Hotswap:");
    });

    test("deve ignorar linha de Hotswap plugin initialized", () => {
        const line = "HOTSWAP AGENT: 10:30:45.123 INFO (org.hotswap.agent) - Plugin 'TomcatPlugin' initialized";
        const result = analyzer.summarize(line);

        expect(result).toBe("");
    });

    test("deve resumir múltiplas classes em Hotswap", () => {
        const line = "HOTSWAP AGENT: 10:30:45.123 RELOAD (org.hotswap.agent) - Reloading classes [Class1, Class2, Class3, Class4, Class5]";
        const result = analyzer.summarize(line);

        expect(result).toContain("Reloading 5 classes");
    });
});
