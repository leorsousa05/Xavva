import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import { ChangelogGenerator } from "../utils/ChangelogGenerator";
import { Logger } from "../utils/ui";
import { existsSync } from "fs";

export class ChangelogCommand implements Command {
    async execute(_config: AppConfig, args?: CLIArguments, positionals?: string[]): Promise<void> {
        // Pula o nome do comando "changelog" e pega a ação
        const action = positionals?.find(p => !["changelog", "gen"].includes(p)) || "generate";
        const output = args?.["output"] || args?.["o"] || "CHANGELOG.md";

        Logger.banner("changelog");

        switch (action) {
            case "generate":
            case "gen":
                await this.generate(output);
                break;
            case "check":
            case "validate":
                await this.validate();
                break;
            case "preview":
                await this.preview();
                break;
            default:
                this.showHelp();
        }
    }

    private async generate(output: string): Promise<void> {
        Logger.section("Generating Changelog");
        Logger.step("Analyzing git history...");

        try {
            ChangelogGenerator.generateAndSave(output);
            
            if (existsSync(output)) {
                Logger.success(`Changelog generated: ${output}`);
            } else {
                Logger.error("Failed to generate changelog");
            }
        } catch (error) {
            Logger.error(`Error: ${error}`);
        }

        Logger.done();
    }

    private async validate(): Promise<void> {
        Logger.section("Validating Conventional Commits");
        
        // Check if commits follow conventional commit format
        const { execSync } = await import("child_process");
        
        try {
            const log = execSync(
                'git log --pretty=format:"%s" --no-merges -20',
                { encoding: "utf-8" }
            );

            const commits = log.trim().split("\n");
            const conventionalPattern = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?(!)?: .+/;
            
            let valid = 0;
            let invalid = 0;

            for (const commit of commits) {
                const isValid = conventionalPattern.test(commit);
                if (isValid) {
                    valid++;
                    Logger.success(commit.slice(0, 60));
                } else {
                    invalid++;
                    Logger.warn(commit.slice(0, 60));
                }
            }

            Logger.newline();
            Logger.info("Summary", `${valid} valid, ${invalid} need improvement`);
            
            if (invalid > 0) {
                Logger.dim("\nValid conventional commit types:");
                Logger.dim("  feat, fix, docs, style, refactor, perf,");
                Logger.dim("  test, build, ci, chore, revert");
                Logger.dim("\nExample: feat(auth): add login endpoint");
            }
        } catch (error) {
            Logger.error(`Failed to validate: ${error}`);
        }

        Logger.done();
    }

    private async preview(): Promise<void> {
        Logger.section("Changelog Preview");
        
        try {
            const changelog = ChangelogGenerator.generate();
            // Show only first 50 lines
            const lines = changelog.split("\n").slice(0, 50);
            Logger.log(lines.join("\n"));
            
            if (changelog.split("\n").length > 50) {
                Logger.dim("\n... (truncated, use 'generate' to see full)");
            }
        } catch (error) {
            Logger.error(`Failed to generate preview: ${error}`);
        }

        Logger.done();
    }

    private showHelp(): void {
        Logger.section("Changelog Commands");
        Logger.info("Usage: xavva changelog <action> [options]");
        Logger.newline();
        Logger.log("Actions:");
        Logger.log(`  ${Logger.C.primary}generate${Logger.C.reset}  Generate CHANGELOG.md (default)`);
        Logger.log(`  ${Logger.C.primary}check${Logger.C.reset}     Validate conventional commits`);
        Logger.log(`  ${Logger.C.primary}preview${Logger.C.reset}   Preview changelog without saving`);
        Logger.newline();
        Logger.log("Options:");
        Logger.log(`  ${Logger.C.primary}-o, --output${Logger.C.reset}  Output file (default: CHANGELOG.md)`);
        Logger.done();
    }
}
