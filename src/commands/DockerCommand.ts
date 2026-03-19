/**
 * Comando de integração Docker
 * xavva docker <action> [options]
 */

import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { DockerService, type DockerConfig } from "../services/DockerService";
import { Logger } from "../utils/ui";
import { ProcessManager } from "../utils/processManager";

export class DockerCommand implements Command {
    async execute(config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        const processManager = ProcessManager.getInstance();
        const action = positionals?.[1] || "status";

        const service = new DockerService();

        // Verifica se Docker está disponível
        const isAvailable = await service.isDockerAvailable();
        if (!isAvailable) {
            Logger.error("Docker is not available");
            Logger.info("Install", "https://docs.docker.com/get-docker/");
            await processManager.shutdown(1);
            return;
        }

        const dockerConfig: DockerConfig = {
            imageName: (args?.name as string) || config.project.appName,
            tag: (args?.tag as string) || "latest",
            port: args?.port ? parseInt(args.port as string) : config.tomcat.port,
            javaVersion: (args?.["java-version"] as string) || "17",
            tomcatVersion: config.tomcat.version
        };

        try {
            switch (action) {
                case "init":
                    await this.handleInit(service, dockerConfig);
                    break;

                case "build":
                    const built = await service.buildImage(dockerConfig.tag);
                    if (!built) {
                        await processManager.shutdown(1);
                    }
                    break;

                case "run":
                case "dev":
                    const running = await service.runDevMode(dockerConfig.port);
                    if (!running) {
                        await processManager.shutdown(1);
                    }
                    break;

                case "up":
                    const up = await service.composeUp(args?.detached);
                    if (!up) {
                        await processManager.shutdown(1);
                    }
                    break;

                case "down":
                case "stop":
                    const down = await service.composeDown();
                    if (!down) {
                        await processManager.shutdown(1);
                    }
                    break;

                case "status":
                case "ps":
                    await service.showContainerStatus();
                    break;

                case "push":
                    await this.handlePush(service, dockerConfig, args);
                    break;

                default:
                    Logger.error(`Unknown docker action: ${action}`);
                    Logger.info("Actions", "init, build, run, up, down, status, push");
                    await processManager.shutdown(1);
            }
        } catch (error) {
            Logger.error(`Docker command failed: ${(error as Error).message}`);
            await processManager.shutdown(1);
        }
    }

    private async handleInit(service: DockerService, config: DockerConfig): Promise<void> {
        Logger.section("Docker Init");
        Logger.info("Generating", "Docker configuration files");

        await service.generateDockerfile(config);
        await service.generateCompose(config);

        Logger.divider();
        Logger.info("Next steps", "");
        Logger.log(`  ${Logger.C.gray}│${Logger.C.reset}  ${Logger.C.primary}xavva docker build${Logger.C.reset}  ${Logger.C.gray}- Build image${Logger.C.reset}`);
        Logger.log(`  ${Logger.C.gray}│${Logger.C.reset}  ${Logger.C.primary}xavva docker up${Logger.C.reset}      ${Logger.C.gray}- Start containers${Logger.C.reset}`);
        Logger.log(`  ${Logger.C.gray}│${Logger.C.reset}  ${Logger.C.primary}xavva docker run${Logger.C.reset}     ${Logger.C.gray}- Run dev mode${Logger.C.reset}`);
        Logger.endSection();
    }

    private async handlePush(service: DockerService, config: DockerConfig, args?: CLIArguments): Promise<void> {
        const registry = args?.registry as string || "docker.io";
        const namespace = args?.namespace as string || "";
        
        const fullImageName = namespace 
            ? `${registry}/${namespace}/${config.imageName}:${config.tag}`
            : `${registry}/${config.imageName}:${config.tag}`;

        Logger.section("Docker Push");
        Logger.info("Image", fullImageName);
        Logger.info("Registry", registry);

        Logger.success("Use: docker push " + fullImageName);
        Logger.dim("Make sure you're logged in: docker login " + registry);
    }
}
