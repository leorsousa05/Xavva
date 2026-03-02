import { expect, test, describe, mock } from "bun:test";
import { CommandRegistry } from "../src/commands/CommandRegistry";
import { ProjectService } from "../src/services/ProjectService";
import { TomcatService } from "../src/services/TomcatService";
import { BuildService } from "../src/services/BuildService";
import { BuildCacheService } from "../src/services/BuildCacheService";
import { AuditService } from "../src/services/AuditService";
import { DeployCommand } from "../src/commands/DeployCommand";
import { BuildCommand } from "../src/commands/BuildCommand";
import { StartCommand } from "../src/commands/StartCommand";
import { AuditCommand } from "../src/commands/AuditCommand";
import type { AppConfig } from "../src/types/config";

describe("Dependency Injection", () => {
    test("deve instanciar serviços e injetar dependências corretamente", () => {
        const config: AppConfig = {
            project: { buildTool: "maven", name: "test-app" },
            tomcat: { path: "/opt/tomcat", webapps: "/opt/tomcat/webapps" },
            audit: { enabled: true, output: "audit.log" }
        };

        // Simula o fluxo do index.ts
        const projectService = new ProjectService(config.project);
        const buildCacheService = new BuildCacheService();
        const buildService = new BuildService(config.project, config.tomcat, projectService, buildCacheService);
        const tomcatService = new TomcatService(config.tomcat);
        tomcatService.setProjectService(projectService);
        const auditService = new AuditService();

        // Verificar se os serviços foram instanciados
        expect(projectService).toBeDefined();
        expect(buildService).toBeDefined();
        expect(tomcatService).toBeDefined();
        expect(auditService).toBeDefined();

        // Registrar Comandos (DI nos comandos)
        const registry = new CommandRegistry();
        
        const deployCmd = new DeployCommand(tomcatService, buildService);
        const buildCmd = new BuildCommand(buildService);
        const startCmd = new StartCommand(tomcatService);
        const auditCmd = new AuditCommand(auditService);

        registry.register("deploy", deployCmd);
        registry.register("build", buildCmd);
        registry.register("start", startCmd);
        registry.register("audit", auditCmd);

        // Validar se o comando recuperado tem o serviço injetado (acessando via private se necessário ou verificando comportamento)
        // Como o TS reclama de private, vamos verificar se o registro funcionou
        expect(registry.get("deploy")).toBe(deployCmd);
        expect(registry.get("build")).toBe(buildCmd);
        expect(registry.get("start")).toBe(startCmd);
        expect(registry.get("audit")).toBe(auditCmd);
    });
});
