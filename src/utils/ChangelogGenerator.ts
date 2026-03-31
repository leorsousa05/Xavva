import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

interface Commit {
    hash: string;
    date: string;
    message: string;
    type: string;
    scope?: string;
    subject: string;
    breaking: boolean;
}

interface Version {
    version: string;
    date: string;
    commits: Commit[];
}

export class ChangelogGenerator {
    private static readonly TYPES: Record<string, { title: string; emoji: string }> = {
        feat: { title: "Features", emoji: "+" },
        fix: { title: "Bug Fixes", emoji: "!" },
        docs: { title: "Documentation", emoji: "D" },
        style: { title: "Styles", emoji: "S" },
        refactor: { title: "Code Refactoring", emoji: "R" },
        perf: { title: "Performance", emoji: "P" },
        test: { title: "Tests", emoji: "T" },
        build: { title: "Build System", emoji: "B" },
        ci: { title: "CI/CD", emoji: "C" },
        chore: { title: "Chores", emoji: "*" },
        revert: { title: "Reverts", emoji: "-" },
    };

    static generate(): string {
        const commits = this.getCommits();
        const versions = this.groupByVersion(commits);
        return this.formatChangelog(versions);
    }

    static generateAndSave(outputPath: string = "CHANGELOG.md"): void {
        const changelog = this.generate();
        writeFileSync(outputPath, changelog);
    }

    private static getCommits(): Commit[] {
        try {
            // Get commits in format: hash|date|message
            const log = execSync(
                'git log --pretty=format:"%h|%ad|%s" --date=short --no-merges',
                { encoding: "utf-8", cwd: process.cwd() }
            );

            return log
                .trim()
                .split("\n")
                .map(line => this.parseCommit(line))
                .filter((c): c is Commit => c !== null);
        } catch {
            return [];
        }
    }

    private static parseCommit(line: string): Commit | null {
        const match = line.match(/^([^|]+)\|([^|]+)\|(.+)$/);
        if (!match) return null;

        const [, hash, date, message] = match;
        const parsed = this.parseConventionalCommit(message);

        return {
            hash,
            date,
            message,
            ...parsed,
        };
    }

    private static parseConventionalCommit(message: string): Omit<Commit, "hash" | "date" | "message"> {
        // Pattern: type(scope)!: subject
        // or: type!: subject
        // or: type(scope): subject
        // or: type: subject
        const pattern = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;
        const match = message.match(pattern);

        if (match) {
            const [, type, scope, breaking, subject] = match;
            return {
                type,
                scope,
                subject,
                breaking: !!breaking || subject.includes("BREAKING CHANGE"),
            };
        }

        // Fallback: treat as chore if doesn't match conventional commit
        return {
            type: "chore",
            subject: message,
            breaking: message.includes("BREAKING CHANGE"),
        };
    }

    private static groupByVersion(commits: Commit[]): Version[] {
        // Group by version tags
        const versions: Version[] = [];
        let currentVersion = "Unreleased";
        let currentDate = new Date().toISOString().split("T")[0];
        let currentCommits: Commit[] = [];

        // Try to get version tags
        const tags = this.getVersionTags();
        
        if (tags.length === 0) {
            // No tags, all commits are unreleased
            return [{
                version: "Unreleased",
                date: currentDate,
                commits,
            }];
        }

        // Process commits and assign to versions
        const versionMap = new Map<string, Commit[]>();
        
        for (const commit of commits) {
            // Find which version this commit belongs to
            const version = this.findVersionForCommit(commit.hash, tags);
            if (!versionMap.has(version)) {
                versionMap.set(version, []);
            }
            versionMap.get(version)!.push(commit);
        }

        // Convert to array
        for (const [version, versionCommits] of versionMap) {
            const tagDate = this.getTagDate(version === "Unreleased" ? null : version);
            versions.push({
                version,
                date: tagDate || currentDate,
                commits: versionCommits,
            });
        }

        // Sort by version (newest first)
        return versions.sort((a, b) => this.compareVersions(b.version, a.version));
    }

    private static getVersionTags(): string[] {
        try {
            const tags = execSync("git tag -l 'v*' --sort=-v:refname", { encoding: "utf-8" });
            return tags.trim().split("\n").filter(Boolean);
        } catch {
            return [];
        }
    }

    private static findVersionForCommit(hash: string, tags: string[]): string {
        try {
            // Check if commit is after a specific tag
            for (const tag of tags) {
                const result = execSync(`git merge-base --is-ancestor ${hash} ${tag} && echo "in" || echo "out"`, {
                    encoding: "utf-8",
                    cwd: process.cwd(),
                });
                if (result.trim() === "in") {
                    return tag;
                }
            }
        } catch {
            // Ignore errors
        }
        return "Unreleased";
    }

    private static getTagDate(tag: string | null): string | null {
        if (!tag) return null;
        try {
            const date = execSync(`git log -1 --format=%ad --date=short ${tag}`, { encoding: "utf-8" });
            return date.trim();
        } catch {
            return null;
        }
    }

    private static compareVersions(a: string, b: string): number {
        if (a === "Unreleased") return -1;
        if (b === "Unreleased") return 1;
        
        const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
        const aParts = parse(a);
        const bParts = parse(b);
        
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aPart = aParts[i] || 0;
            const bPart = bParts[i] || 0;
            if (aPart !== bPart) return aPart - bPart;
        }
        return 0;
    }

    private static formatChangelog(versions: Version[]): string {
        const lines: string[] = [
            "# Changelog\n",
            "All notable changes to this project will be documented in this file.\n",
            "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),",
            "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n",
        ];

        for (const version of versions) {
            lines.push(this.formatVersion(version));
        }

        return lines.join("\n");
    }

    private static formatVersion(version: Version): string {
        const lines: string[] = [
            `## [${version.version}] - ${version.date}`,
            "",
        ];

        // Group commits by type
        const byType = new Map<string, Commit[]>();
        for (const commit of version.commits) {
            if (!byType.has(commit.type)) {
                byType.set(commit.type, []);
            }
            byType.get(commit.type)!.push(commit);
        }

        // Output in conventional order
        const typeOrder = Object.keys(this.TYPES);
        
        for (const type of typeOrder) {
            const commits = byType.get(type);
            if (!commits || commits.length === 0) continue;

            const { title, emoji } = this.TYPES[type];
            lines.push(`### ${emoji} ${title}\n`);

            for (const commit of commits) {
                const scope = commit.scope ? `**${commit.scope}**: ` : "";
                const breaking = commit.breaking ? " 💥 **BREAKING CHANGE**" : "";
                lines.push(`- ${scope}${commit.subject} ([${commit.hash}])${breaking}`);
            }

            lines.push("");
        }

        return lines.join("\n");
    }
}
