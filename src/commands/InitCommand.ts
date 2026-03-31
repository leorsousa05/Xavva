import { input, select, confirm, number } from "@inquirer/prompts";
import { writeFile, access, readFile } from "fs/promises";
import { join } from "path";
import { constants, existsSync } from "fs";
import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { Logger } from "../logging";

export class InitCommand implements Command {
    private logger = Logger.getInstance();

    async execute(_config: AppConfig, _args?: CLIArguments): Promise<void> {
        this.logger.section("Project Setup Wizard");
        this.logger.info("Vamos configurar seu projeto Xavva");
        this.logger.newline();

        // Detect build tool and available profiles
        const buildTool = await this.detectBuildTool();
        const availableProfiles = await this.detectProfiles(buildTool);
        
        // Application name
        const appName = await input({
            message: "Application name:",
            default: process.cwd().split(/[/\\]/).pop() || "my-app",
            validate: (value) => value.length > 0 || "Name is required"
        });

        // Profile selection with explanation
        this.logger.newline();
        console.log("The profile is used to activate Maven/Gradle build configurations");
        console.log("(e.g., 'dev' for development, 'prod' for production)");
        
        let profile: string;
        
        if (availableProfiles.length > 0) {
            // Profiles found in build file
            const profileChoices = [
                ...availableProfiles.map(p => ({ 
                    name: `${p.name}${p.description ? ` - ${p.description}` : ''}`, 
                    value: p.name 
                })),
                { name: "Other (custom)", value: "custom" }
            ];
            
            profile = await select({
                message: "Select a profile from your build file:",
                choices: profileChoices,
                default: availableProfiles.find(p => p.name === "dev")?.name || availableProfiles[0]?.name
            });
        } else {
            // No profiles detected, show common options
            profile = await select({
                message: "Default profile:",
                choices: [
                    { name: "dev - Development environment", value: "dev" },
                    { name: "test - Testing environment", value: "test" },
                    { name: "prod - Production environment", value: "prod" },
                    { name: "Other (custom)", value: "custom" }
                ],
                default: "dev"
            });
        }

        if (profile === "custom") {
            profile = await input({
                message: "Profile name:",
                default: "local",
                validate: (value) => value.length > 0 || "Profile name is required"
            });
        }

        // Tomcat port
        const port = await number({
            message: "Tomcat port:",
            default: 8080,
            validate: (value) => (value && value > 0 && value < 65536) || "Invalid port"
        }) || 8080;

        // Optional settings
        this.logger.newline();
        console.log("Advanced settings:");
        
        const useEmbedded = await confirm({
            message: "Use embedded Tomcat (auto-download)?",
            default: true
        });

        const enableCache = await confirm({
            message: "Enable build cache?",
            default: true
        });

        const enableTui = await confirm({
            message: "Enable TUI dashboard?",
            default: true
        });

        const encoding = await select({
            message: "Source encoding:",
            choices: [
                { name: "UTF-8 (recommended)", value: "UTF-8" },
                { name: "ISO-8859-1 (Latin-1)", value: "ISO-8859-1" },
                { name: "Windows-1252", value: "Windows-1252" }
            ],
            default: "UTF-8"
        });

        // Multi-environment setup
        const enableMultiEnv = await confirm({
            message: "Configure multiple environments?",
            default: false
        });

        // Build config object
        const config: Record<string, unknown> = {
            appName,
            buildTool,
            profile,
            port,
            cache: enableCache,
            tui: enableTui,
            encoding
        };

        if (useEmbedded) {
            config.embedded = true;
            config.tomcatVersion = await select({
                message: "Tomcat version:",
                choices: [
                    { name: "10.1.52 (Jakarta EE 10, recommended)", value: "10.1.52" },
                    { name: "9.0.115 (Java EE 8)", value: "9.0.115" },
                    { name: "11.0.18 (Jakarta EE 11, preview)", value: "11.0.18" }
                ],
                default: "10.1.52"
            });
        } else {
            const tomcatPath = await input({
                message: "Tomcat path (CATALINA_HOME):",
                validate: async (value) => {
                    if (!value) return "Path is required";
                    try {
                        await access(value, constants.R_OK);
                        return true;
                    } catch {
                        return "Path not accessible";
                    }
                }
            });
            config.tomcatPath = tomcatPath;
        }

        // Add environments if enabled
        if (enableMultiEnv) {
            this.logger.newline();
            console.log("Environment Configuration:");
            
            const environments: Record<string, unknown> = {};
            
            // Dev environment
            const devPort = await number({
                message: "Dev environment port:",
                default: port
            }) || port;
            environments.dev = {
                port: devPort,
                profile: "dev"
            };
            
            // Test environment
            const testPort = await number({
                message: "Test environment port:",
                default: port + 1
            }) || port + 1;
            environments.test = {
                port: testPort,
                profile: "test"
            };
            
            // Staging environment
            const hasStaging = await confirm({
                message: "Add staging environment?",
                default: true
            });
            
            if (hasStaging) {
                const stagingPort = await number({
                    message: "Staging environment port:",
                    default: port + 2
                }) || port + 2;
                environments.staging = {
                    port: stagingPort,
                    profile: "staging"
                };
            }
            
            config.environments = environments;
            
            // Add DB config example
            const addDbExample = await confirm({
                message: "Add database configuration example?",
                default: true
            });
            
            if (addDbExample) {
                environments.dev = {
                    ...environments.dev,
                    db: {
                        url: "jdbc:h2:mem:devdb",
                        username: "sa",
                        password: ""
                    }
                };
            }
        }

        // Save file
        this.logger.newline();
        this.logger.step("Saving configuration...");

        const configPath = join(process.cwd(), "xavva.json");
        await writeFile(configPath, JSON.stringify(config, null, 2));

        this.logger.success(`Configuration saved to ${configPath}`);
        this.logger.newline();
        this.logger.ready("Project configured!");
        this.logger.info("Next steps:");
        console.log(`  │   xavva build   - Compile project`);
        console.log(`  │   xavva deploy  - Build + deploy`);
        console.log(`  │   xavva health  - Check environment`);
        this.logger.newline();
    }

    private async detectBuildTool(): Promise<"maven" | "gradle"> {
        const hasPom = existsSync(join(process.cwd(), "pom.xml"));
        const hasGradle = existsSync(join(process.cwd(), "build.gradle")) || 
                          existsSync(join(process.cwd(), "build.gradle.kts"));

        if (hasPom && !hasGradle) {
            this.logger.info("Detected: Maven project");
            return "maven";
        }
        
        if (hasGradle && !hasPom) {
            this.logger.info("Detected: Gradle project");
            return "gradle";
        }

        if (hasPom && hasGradle) {
            this.logger.warn("Both pom.xml and build.gradle found");
            const choice = await select({
                message: "Select build tool:",
                choices: [
                    { name: "Maven (pom.xml)", value: "maven" },
                    { name: "Gradle (build.gradle)", value: "gradle" }
                ]
            });
            return choice;
        }

        // Neither found
        const choice = await select({
            message: "Build tool:",
            choices: [
                { name: "Maven", value: "maven" },
                { name: "Gradle", value: "gradle" }
            ]
        });
        return choice;
    }

    private async detectProfiles(buildTool: "maven" | "gradle"): Promise<Array<{name: string, description?: string}>> {
        const profiles: Array<{name: string, description?: string}> = [];
        
        try {
            if (buildTool === "maven") {
                const pomPath = join(process.cwd(), "pom.xml");
                if (existsSync(pomPath)) {
                    const content = await readFile(pomPath, "utf-8");
                    // Parse profiles from pom.xml
                    const profileMatches = content.matchAll(/<profile>[\s\S]*?<id>([^<]+)<\/id>[\s\S]*?<\/profile>/g);
                    for (const match of profileMatches) {
                        const profileContent = match[0];
                        const id = match[1].trim();
                        // Try to extract description or properties
                        const descMatch = profileContent.match(/<description>([^<]+)<\/description>/);
                        const desc = descMatch ? descMatch[1].trim() : undefined;
                        profiles.push({ name: id, description: desc });
                    }
                }
            } else {
                const gradlePath = join(process.cwd(), "build.gradle");
                const gradleKtsPath = join(process.cwd(), "build.gradle.kts");
                const gradleFile = existsSync(gradlePath) ? gradlePath : gradleKtsPath;
                
                if (existsSync(gradleFile)) {
                    const content = await readFile(gradleFile, "utf-8");
                    // Look for common profile-like configurations
                    // Gradle doesn't have built-in profiles like Maven, but can use:
                    // - Properties (-Pprofile=dev)
                    // - Custom configurations
                    // - apply from: "profiles/${profile}.gradle"
                    const profileMatches = content.matchAll(/(?:apply from:|def\s+\w*[Pp]rofile|ext\.\w*[Pp]rofile)\s*=\s*["']([^"']+)["']/g);
                    for (const match of profileMatches) {
                        profiles.push({ name: match[1] });
                    }
                }
            }
        } catch {
            // Ignore errors, return empty profiles
        }
        
        return profiles;
    }
}
