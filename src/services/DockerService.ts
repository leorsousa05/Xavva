/**
 * Serviço de integração com Docker
 * Gera configs e gerencia containers
 */

import { Logger } from "../utils/ui";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export interface DockerConfig {
    imageName: string;
    tag?: string;
    port?: number;
    javaVersion?: string;
    tomcatVersion?: string;
}

export interface ContainerInfo {
    id: string;
    name: string;
    image: string;
    status: string;
    ports: string;
    created: string;
}

export class DockerService {
    private projectPath: string;
    private projectName: string;

    constructor(projectPath: string = process.cwd()) {
        this.projectPath = projectPath;
        this.projectName = path.basename(projectPath).toLowerCase().replace(/[^a-z0-9]/g, "-");
    }

    /**
     * Verifica se Docker está disponível
     */
    async isDockerAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            const child = spawn("docker", ["--version"], { shell: true });
            child.on("close", (code) => resolve(code === 0));
            child.on("error", () => resolve(false));
        });
    }

    /**
     * Verifica se o Docker daemon está rodando
     */
    async isDaemonRunning(): Promise<boolean> {
        return new Promise((resolve) => {
            const child = spawn("docker", ["info"], { shell: true });
            child.on("close", (code) => resolve(code === 0));
            child.on("error", () => resolve(false));
        });
    }

    /**
     * Gera Dockerfile para o projeto
     */
    async generateDockerfile(config: DockerConfig = {}): Promise<void> {
        const imageName = config.imageName || this.projectName;
        const javaVersion = config.javaVersion || "17";
        const port = config.port || 8080;

        // Detectar build tool
        const hasMaven = fs.existsSync(path.join(this.projectPath, "pom.xml"));
        const hasGradle = fs.existsSync(path.join(this.projectPath, "build.gradle")) ||
                         fs.existsSync(path.join(this.projectPath, "build.gradle.kts"));

        const dockerfile = hasMaven 
            ? this.generateMavenDockerfile(javaVersion, port)
            : hasGradle 
                ? this.generateGradleDockerfile(javaVersion, port)
                : this.generateGenericDockerfile(javaVersion, port);

        const dockerfilePath = path.join(this.projectPath, "Dockerfile");
        fs.writeFileSync(dockerfilePath, dockerfile);

        Logger.success(`Dockerfile generated: ${dockerfilePath}`);
    }

    /**
     * Gera docker-compose.yml
     */
    async generateCompose(config: DockerConfig = {}): Promise<void> {
        const serviceName = config.imageName || this.projectName;
        const port = config.port || 8080;

        const compose = `version: '3.8'

services:
  ${serviceName}:
    build: .
    ports:
      - "${port}:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - JAVA_OPTS=-Xmx512m
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Add database service
  # postgres:
  #   image: postgres:15-alpine
  #   environment:
  #     POSTGRES_DB: ${serviceName}
  #     POSTGRES_USER: app
  #     POSTGRES_PASSWORD: secret
  #   ports:
  #     - "5432:5432"
  #   volumes:
  #     - postgres_data:/var/lib/postgresql/data

# volumes:
#   postgres_data:
`;

        const composePath = path.join(this.projectPath, "docker-compose.yml");
        fs.writeFileSync(composePath, compose);

        Logger.success(`docker-compose.yml generated: ${composePath}`);
    }

    /**
     * Build da imagem Docker
     */
    async buildImage(tag?: string): Promise<boolean> {
        const imageTag = tag || `${this.projectName}:latest`;
        
        Logger.section("Building Docker Image");
        Logger.info("Image", imageTag);

        return new Promise((resolve) => {
            const args = ["build", "-t", imageTag, "."];
            const child = spawn("docker", args, {
                cwd: this.projectPath,
                stdio: "inherit",
                shell: true
            });

            child.on("close", (code) => {
                if (code === 0) {
                    Logger.success(`Image built: ${imageTag}`);
                } else {
                    Logger.error("Build failed");
                }
                resolve(code === 0);
            });
        });
    }

    /**
     * Roda container com hot-reload
     */
    async runDevMode(port?: number): Promise<boolean> {
        const containerPort = port || 8080;
        const containerName = `${this.projectName}-dev`;

        Logger.section("Running Docker Dev Mode");
        Logger.info("Container", containerName);
        Logger.info("Port", `${containerPort}:8080`);

        // Verifica se já existe container rodando
        await this.stopContainer(containerName);

        return new Promise((resolve) => {
            const args = [
                "run", "--rm",
                "--name", containerName,
                "-p", `${containerPort}:8080`,
                "-v", `${this.projectPath}:/app`,
                "-w", "/app",
                "-e", "MAVEN_OPTS=-XX:+UseG1GC",
                "maven:3.9-eclipse-temurin-17",
                "mvn", "tomcat7:run"
            ];

            const child = spawn("docker", args, {
                stdio: "inherit",
                shell: true
            });

            child.on("close", (code) => {
                resolve(code === 0);
            });
        });
    }

    /**
     * Roda docker-compose
     */
    async composeUp(detached: boolean = false): Promise<boolean> {
        Logger.section("Starting Docker Compose");

        return new Promise((resolve) => {
            const args = ["up"];
            if (detached) args.push("-d");
            args.push("--build");

            const child = spawn("docker-compose", args, {
                cwd: this.projectPath,
                stdio: "inherit",
                shell: true
            });

            child.on("close", (code) => {
                if (code === 0 && detached) {
                    Logger.success("Containers started");
                    this.showContainerStatus();
                }
                resolve(code === 0);
            });
        });
    }

    /**
     * Para containers do compose
     */
    async composeDown(): Promise<boolean> {
        Logger.section("Stopping Docker Compose");

        return new Promise((resolve) => {
            const child = spawn("docker-compose", ["down"], {
                cwd: this.projectPath,
                stdio: "inherit",
                shell: true
            });

            child.on("close", (code) => {
                if (code === 0) {
                    Logger.success("Containers stopped");
                }
                resolve(code === 0);
            });
        });
    }

    /**
     * Lista containers do projeto
     */
    async listContainers(): Promise<ContainerInfo[]> {
        return new Promise((resolve) => {
            const child = spawn("docker", [
                "ps", "-a",
                "--filter", `name=${this.projectName}`,
                "--format", "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}"
            ], { shell: true });

            let output = "";
            child.stdout?.on("data", (data) => output += data.toString());

            child.on("close", () => {
                const containers: ContainerInfo[] = [];
                for (const line of output.trim().split("\n")) {
                    const parts = line.split("|");
                    if (parts.length >= 6) {
                        containers.push({
                            id: parts[0].slice(0, 12),
                            name: parts[1],
                            image: parts[2],
                            status: parts[3],
                            ports: parts[4],
                            created: parts[5]
                        });
                    }
                }
                resolve(containers);
            });
        });
    }

    /**
     * Mostra status dos containers
     */
    async showContainerStatus(): Promise<void> {
        const containers = await this.listContainers();
        
        if (containers.length === 0) {
            Logger.info("Containers", "None found");
            return;
        }

        Logger.divider();
        for (const c of containers) {
            const statusColor = c.status.includes("Up") ? Logger.C.success : Logger.C.error;
            Logger.info(c.name, `${statusColor}${c.status}${Logger.C.reset}`);
            if (c.ports) {
                Logger.dim(`  ${c.ports}`);
            }
        }
    }

    /**
     * Para um container específico
     */
    private async stopContainer(name: string): Promise<void> {
        return new Promise((resolve) => {
            const child = spawn("docker", ["stop", name], { shell: true });
            child.on("close", () => resolve());
        });
    }

    // ===== Dockerfile Generators =====

    private generateMavenDockerfile(javaVersion: string, port: number): string {
        return `# Build stage
FROM maven:3.9-eclipse-temurin-${javaVersion}-alpine AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

# Runtime stage
FROM eclipse-temurin:${javaVersion}-jdk-alpine
WORKDIR /app
COPY --from=builder /app/target/*.war app.war

EXPOSE ${port}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \\
    CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/ || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
`;
    }

    private generateGradleDockerfile(javaVersion: string, port: number): string {
        return `# Build stage
FROM gradle:8-jdk${javaVersion}-alpine AS builder
WORKDIR /app
COPY build.gradle settings.gradle ./
COPY gradle ./gradle
RUN gradle dependencies --no-daemon
COPY src ./src
RUN gradle bootWar -x test --no-daemon

# Runtime stage
FROM eclipse-temurin:${javaVersion}-jdk-alpine
WORKDIR /app
COPY --from=builder /app/build/libs/*.war app.war

EXPOSE ${port}

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \\
    CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/ || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
`;
    }

    private generateGenericDockerfile(javaVersion: string, port: number): string {
        return `FROM eclipse-temurin:${javaVersion}-jdk-alpine
WORKDIR /app
COPY . .
RUN ./mvnw package -DskipTests || ./gradlew bootWar -x test || echo "Build manually"

EXPOSE ${port}
ENTRYPOINT ["java", "-jar", "app.war"]
`;
    }
}
