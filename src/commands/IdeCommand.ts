/**
 * Comando IDE - Gera configurações para editores
 * 
 * Suporta:
 * - VS Code (.vscode/)
 * - IntelliJ IDEA (.idea/)
 * - Eclipse (.settings/)
 */

import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../logging";

interface IdeConfig {
    name: string;
    files: Array<{
        path: string;
        content: string;
    }>;
}

export class IdeCommand implements Command {
    private logger = Logger.getInstance();

    async execute(config: AppConfig, args: CLIArguments): Promise<void> {
        const ide = (args as any).ide as 'vscode' | 'idea' | 'eclipse' | undefined;
        
        if (!ide) {
            this.logger.error("Especifique a IDE: --ide vscode|idea|eclipse");
            return;
        }

        this.logger.section(`Gerando configuração para ${ide.toUpperCase()}`);

        switch (ide) {
            case 'vscode':
                await this.generateVSCode(config);
                break;
            case 'idea':
                await this.generateIdea(config);
                break;
            case 'eclipse':
                await this.generateEclipse(config);
                break;
            default:
                this.logger.error(`IDE não suportada: ${ide}`);
        }
    }

    private async generateVSCode(config: AppConfig): Promise<void> {
        const vscodeDir = path.join(process.cwd(), ".vscode");
        
        // launch.json - Configuração de debug
        const launchConfig = {
            version: "0.2.0",
            configurations: [
                {
                    type: "java",
                    name: "Debug (Attach) - Xavva",
                    request: "attach",
                    hostName: "localhost",
                    port: config.project.debugPort,
                },
                {
                    type: "java",
                    name: "Debug (Launch) - Current File",
                    request: "launch",
                    mainClass: "${file}",
                },
            ],
        };

        // tasks.json - Tarefas de build
        const tasksConfig = {
            version: "2.0.0",
            tasks: [
                {
                    label: "xavva: build",
                    type: "shell",
                    command: "xavva build",
                    group: "build",
                    problemMatcher: ["$javac"],
                },
                {
                    label: "xavva: deploy",
                    type: "shell",
                    command: "xavva deploy",
                    group: "build",
                    problemMatcher: ["$javac"],
                },
                {
                    label: "xavva: dev",
                    type: "shell",
                    command: "xavva dev",
                    group: "build",
                    isBackground: true,
                    problemMatcher: {
                        pattern: {
                            regexp: ".",
                        },
                        background: {
                            activeOnStart: true,
                            beginsPattern: ".",
                            endsPattern: ".",
                        },
                    },
                },
                {
                    label: "xavva: test",
                    type: "shell",
                    command: "xavva test",
                    group: "test",
                },
            ],
        };

        // settings.json - Configurações do workspace
        const settingsConfig = {
            "java.configuration.updateBuildConfiguration": "automatic",
            "java.compile.nullAnalysis.mode": "automatic",
            "editor.formatOnSave": true,
            "files.exclude": {
                "**/target": true,
                "**/build": true,
                "**/.xavva": true,
                "**/.gradle": true,
            },
        };

        // extensions.json - Recomendações
        const extensionsConfig = {
            recommendations: [
                "vscjava.vscode-java-pack",
                "vscjava.vscode-java-debug",
                "vscjava.vscode-maven",
                "redhat.vscode-xml",
            ],
        };

        await mkdir(vscodeDir, { recursive: true });
        
        await writeFile(
            path.join(vscodeDir, "launch.json"),
            JSON.stringify(launchConfig, null, 4)
        );
        await writeFile(
            path.join(vscodeDir, "tasks.json"),
            JSON.stringify(tasksConfig, null, 4)
        );
        await writeFile(
            path.join(vscodeDir, "settings.json"),
            JSON.stringify(settingsConfig, null, 4)
        );
        await writeFile(
            path.join(vscodeDir, "extensions.json"),
            JSON.stringify(extensionsConfig, null, 4)
        );

        this.logger.success("Configuração VS Code gerada!");
        this.logger.info("Arquivos criados:");
        this.logger.info("  • .vscode/launch.json - Configuração de debug");
        this.logger.info("  • .vscode/tasks.json - Tarefas de build");
        this.logger.info("  • .vscode/settings.json - Configurações do workspace");
        this.logger.info("  • .vscode/extensions.json - Extensões recomendadas");
        this.logger.newline();
        this.logger.info("💡 Instale as extensões recomendadas para melhor experiência");
    }

    private async generateIdea(config: AppConfig): Promise<void> {
        const ideaDir = path.join(process.cwd(), ".idea");
        const runConfigsDir = path.join(ideaDir, "runConfigurations");

        // runConfigurations/Xavva_Deploy.xml
        const deployConfig = `<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Xavva - Deploy" type="ShConfigurationType">
    <option name="SCRIPT_TEXT" value="xavva deploy" />
    <option name="INDEPENDENT_SCRIPT_PATH" value="true" />
    <option name="SCRIPT_PATH" value="" />
    <option name="SCRIPT_OPTIONS" value="" />
    <option name="INDEPENDENT_SCRIPT_WORKING_DIRECTORY" value="true" />
    <option name="SCRIPT_WORKING_DIRECTORY" value="$PROJECT_DIR$" />
    <option name="INDEPENDENT_INTERPRETER_PATH" value="true" />
    <option name="INTERPRETER_PATH" value="" />
    <option name="INTERPRETER_OPTIONS" value="" />
    <option name="EXECUTE_IN_TERMINAL" value="true" />
    <option name="EXECUTE_SCRIPT_FILE" value="false" />
    <envs />
    <method v="2" />
  </configuration>
</component>`;

        // runConfigurations/Xavva_Dev.xml
        const devConfig = `<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="Xavva - Dev Mode" type="ShConfigurationType">
    <option name="SCRIPT_TEXT" value="xavva dev" />
    <option name="INDEPENDENT_SCRIPT_PATH" value="true" />
    <option name="SCRIPT_PATH" value="" />
    <option name="SCRIPT_OPTIONS" value="" />
    <option name="INDEPENDENT_SCRIPT_WORKING_DIRECTORY" value="true" />
    <option name="SCRIPT_WORKING_DIRECTORY" value="$PROJECT_DIR$" />
    <option name="INDEPENDENT_INTERPRETER_PATH" value="true" />
    <option name="INTERPRETER_PATH" value="" />
    <option name="INTERPRETER_OPTIONS" value="" />
    <option name="EXECUTE_IN_TERMINAL" value="true" />
    <option name="EXECUTE_SCRIPT_FILE" value="false" />
    <envs />
    <method v="2" />
  </configuration>
</component>`;

        // External Tools - xavva.xml
        const externalTools = `<toolSet name="Xavva">
  <tool name="Build" showInMainMenu="false" showInEditor="false" showInProject="false" disabled="false" useConsole="true" showConsoleOnStdOut="false" showConsoleOnStdErr="false" synchronizeAfterRun="true">
    <exec>
      <option name="COMMAND" value="xavva" />
      <option name="PARAMETERS" value="build" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
  <tool name="Deploy" showInMainMenu="false" showInEditor="false" showInProject="false" disabled="false" useConsole="true" showConsoleOnStdOut="false" showConsoleOnStdErr="false" synchronizeAfterRun="true">
    <exec>
      <option name="COMMAND" value="xavva" />
      <option name="PARAMETERS" value="deploy" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
</toolSet>`;

        await mkdir(runConfigsDir, { recursive: true });
        await mkdir(path.join(ideaDir, "externalTools"), { recursive: true });

        await writeFile(path.join(runConfigsDir, "Xavva_Deploy.xml"), deployConfig);
        await writeFile(path.join(runConfigsDir, "Xavva_Dev.xml"), devConfig);
        await writeFile(
            path.join(ideaDir, "externalTools", "xavva.xml"),
            externalTools
        );

        this.logger.success("Configuração IntelliJ IDEA gerada!");
        this.logger.info("Arquivos criados:");
        this.logger.info("  • .idea/runConfigurations/Xavva_Deploy.xml");
        this.logger.info("  • .idea/runConfigurations/Xavva_Dev.xml");
        this.logger.info("  • .idea/externalTools/xavva.xml");
        this.logger.newline();
        this.logger.info("💡 Reinicie o IntelliJ para carregar as configurações");
    }

    private async generateEclipse(config: AppConfig): Promise<void> {
        const settingsDir = path.join(process.cwd(), ".settings");

        // External tool builders
        const builderConfig = `<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
    <name>${config.project.appName || "project"}</name>
    <comment></comment>
    <projects>
    </projects>
    <buildSpec>
        <buildCommand>
            <name>org.eclipse.jdt.core.javabuilder</name>
            <arguments>
            </arguments>
        </buildCommand>
        <buildCommand>
            <name>org.eclipse.ui.externaltools.ExternalToolBuilder</name>
            <triggers>full,incremental,</triggers>
            <arguments>
                <dictionary>
                    <key>LaunchConfigHandle</key>
                    <value>&lt;project&gt;/.externalToolBuilders/Xavva Deploy.launch</value>
                </dictionary>
            </arguments>
        </buildCommand>
    </buildSpec>
    <natures>
        <nature>org.eclipse.jdt.core.javanature</nature>
    </natures>
</projectDescription>`;

        // External tool launcher
        const launcherConfig = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
'<launchConfiguration type="org.eclipse.ui.externaltools.ProgramBuilderLaunchConfigurationType">\n' +
'    <booleanAttribute key="org.eclipse.debug.ui.ATTR_LAUNCH_IN_BACKGROUND" value="false"/>\n' +
'    <stringAttribute key="org.eclipse.ui.externaltools.ATTR_LOCATION" value="xavva"/>\n' +
'    <stringAttribute key="org.eclipse.ui.externaltools.ATTR_TOOL_ARGUMENTS" value="deploy"/>\n' +
'    <booleanAttribute key="org.eclipse.ui.externaltools.ATTR_TRIGGERS_CONFIGURED" value="true"/>\n' +
'    <stringAttribute key="org.eclipse.ui.externaltools.ATTR_WORKING_DIRECTORY" value="${workspace_loc:/${project_name}}"/>\n' +
'</launchConfiguration>';

        const externalToolsDir = path.join(process.cwd(), ".externalToolBuilders");
        await mkdir(externalToolsDir, { recursive: true });
        await mkdir(settingsDir, { recursive: true });

        await writeFile(
            path.join(process.cwd(), ".project"),
            builderConfig
        );
        await writeFile(
            path.join(externalToolsDir, "Xavva Deploy.launch"),
            launcherConfig
        );

        this.logger.success("Configuração Eclipse gerada!");
        this.logger.info("Arquivos criados:");
        this.logger.info("  • .project");
        this.logger.info("  • .externalToolBuilders/Xavva Deploy.launch");
        this.logger.newline();
        this.logger.info("💡 Importe o projeto como 'Existing Projects into Workspace'");
    }
}
