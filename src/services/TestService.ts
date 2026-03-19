/**
 * Serviço de execução de testes
 * Suporta Maven e Gradle com modo watch
 */

import { Logger } from "../utils/ui";
import { spawn } from "child_process";
import { watch, type FSWatcher } from "fs";
import path from "path";
import { promisify } from "util";

export interface TestOptions {
    watch?: boolean;
    coverage?: boolean;
    filter?: string;
    verbose?: boolean;
    failFast?: boolean;
    parallel?: boolean;
}

export interface TestResult {
    success: boolean;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    failures: TestFailure[];
}

export interface TestFailure {
    className: string;
    methodName: string;
    message: string;
    stackTrace?: string;
}

export class TestService {
    private buildTool: "maven" | "gradle";
    private watcher: FSWatcher | null = null;
    private isRunning = false;

    constructor(buildTool: "maven" | "gradle") {
        this.buildTool = buildTool;
    }

    async runTests(options: TestOptions = {}): Promise<TestResult> {
        if (this.isRunning) {
            Logger.warn("Test execution already in progress...");
            return this.createEmptyResult();
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            Logger.section("Running Tests");
            
            if (options.filter) {
                Logger.info("Filter", options.filter);
            }
            if (options.coverage) {
                Logger.info("Coverage", "enabled");
            }

            const command = this.buildCommand(options);
            const result = await this.executeTests(command, options.verbose);
            
            result.duration = Date.now() - startTime;
            this.printResults(result);
            
            return result;
        } finally {
            this.isRunning = false;
            Logger.endSection();
        }
    }

    startWatch(options: TestOptions = {}): void {
        if (this.watcher) {
            Logger.warn("Test watcher already running");
            return;
        }

        Logger.section("Test Watch Mode");
        Logger.info("Watching", "src/test/**/*");
        Logger.info("Press", "Ctrl+C to stop");
        Logger.endSection();

        // Run tests initially
        this.runTests(options);

        // Watch for changes
        const testPath = path.join(process.cwd(), "src", "test");
        const mainPath = path.join(process.cwd(), "src", "main");

        this.watcher = watch(
            [testPath, mainPath],
            { recursive: true },
            (eventType, filename) => {
                if (filename && this.isTestFile(filename)) {
                    Logger.watch(`Test file changed: ${filename}`);
                    this.debounceRun(options);
                }
            }
        );
    }

    stopWatch(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            Logger.info("Test watcher stopped");
        }
    }

    private debounceRun(options: TestOptions): void {
        // Simple debounce
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.runTests(options);
        }, 500);
    }

    private debounceTimer: Timer | null = null;

    private buildCommand(options: TestOptions): string[] {
        if (this.buildTool === "maven") {
            return this.buildMavenCommand(options);
        } else {
            return this.buildGradleCommand(options);
        }
    }

    private buildMavenCommand(options: TestOptions): string[] {
        const cmd = process.platform === "win32" ? "mvn.cmd" : "mvn";
        const args: string[] = [cmd];

        if (options.coverage) {
            args.push("jacoco:prepare-agent");
        }

        args.push("test");

        if (options.coverage) {
            args.push("jacoco:report");
        }

        if (options.filter) {
            // Maven surefire plugin syntax
            args.push(`-Dtest=${options.filter}`);
        }

        if (options.failFast) {
            args.push("-Dsurefire.failIfNoSpecifiedTests=false");
        }

        if (options.parallel) {
            args.push("-Dsurefire.parallel=methods");
            args.push("-Dsurefire.threadCount=4");
        }

        if (!options.verbose) {
            args.push("-q");
        }

        return args;
    }

    private buildGradleCommand(options: TestOptions): string[] {
        const cmd = process.platform === "win32" ? "gradle.bat" : "gradle";
        const args: string[] = [cmd, "test"];

        if (options.coverage) {
            args.push("jacocoTestReport");
        }

        if (options.filter) {
            args.push(`--tests`, options.filter);
        }

        if (options.failFast) {
            args.push("--fail-fast");
        }

        if (options.parallel) {
            args.push("--parallel");
        }

        if (!options.verbose) {
            args.push("-q");
        }

        return args;
    }

    private executeTests(command: string[], verbose: boolean = false): Promise<TestResult> {
        return new Promise((resolve) => {
            const [cmd, ...args] = command;
            const child = spawn(cmd, args, {
                cwd: process.cwd(),
                stdio: verbose ? "inherit" : "pipe",
                shell: process.platform === "win32"
            });

            let stdout = "";
            let stderr = "";

            if (!verbose) {
                child.stdout?.on("data", (data) => {
                    stdout += data.toString();
                });
                child.stderr?.on("data", (data) => {
                    stderr += data.toString();
                });
            }

            const spinner = verbose ? () => {} : Logger.spinner("Running tests");

            child.on("close", (code) => {
                spinner(code === 0);
                const result = this.parseTestOutput(stdout + stderr, code === 0);
                resolve(result);
            });

            child.on("error", (error) => {
                spinner(false);
                Logger.error(`Failed to run tests: ${error.message}`);
                resolve(this.createEmptyResult());
            });
        });
    }

    private parseTestOutput(output: string, success: boolean): TestResult {
        const result: TestResult = {
            success,
            totalTests: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            failures: []
        };

        if (this.buildTool === "maven") {
            // Parse Maven Surefire output
            const testsRun = output.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/);
            if (testsRun) {
                result.totalTests = parseInt(testsRun[1]);
                result.failed = parseInt(testsRun[2]) + parseInt(testsRun[3]);
                result.skipped = parseInt(testsRun[4]);
                result.passed = result.totalTests - result.failed - result.skipped;
            }

            // Parse failures
            const failureMatches = output.matchAll(/\[ERROR\]\s+(\S+)\.(\S+)\s+\[(.+?)\]\s+(.+)/g);
            for (const match of failureMatches) {
                result.failures.push({
                    className: match[1],
                    methodName: match[2],
                    message: match[4]
                });
            }
        } else {
            // Parse Gradle output
            const testsRun = output.match(/(\d+) tests completed,(\s*\d+ failed)?/);
            if (testsRun) {
                result.totalTests = parseInt(testsRun[1]);
                const failed = testsRun[2] ? parseInt(testsRun[2].trim()) : 0;
                result.failed = failed;
                result.passed = result.totalTests - result.failed;
            }
        }

        return result;
    }

    private printResults(result: TestResult): void {
        Logger.divider();
        
        if (result.success && result.failed === 0) {
            Logger.success(`All tests passed! (${result.passed} tests)`);
        } else if (result.failed > 0) {
            Logger.error(`${result.failed} test(s) failed`);
        }

        Logger.info("Total", result.totalTests);
        Logger.info("Passed", `${Logger.C.success}${result.passed}${Logger.C.reset}`);
        Logger.info("Failed", result.failed > 0 ? `${Logger.C.error}${result.failed}${Logger.C.reset}` : "0");
        Logger.info("Skipped", result.skipped);
        Logger.info("Duration", `${(result.duration / 1000).toFixed(2)}s`);

        if (result.failures.length > 0) {
            Logger.divider();
            Logger.section("Failures");
            for (const failure of result.failures.slice(0, 5)) {
                Logger.error(`${failure.className}.${failure.methodName}`);
                Logger.dim(`  ${failure.message}`);
            }
            if (result.failures.length > 5) {
                Logger.dim(`  ... and ${result.failures.length - 5} more`);
            }
            Logger.endSection();
        }
    }

    private isTestFile(filename: string): boolean {
        return filename.endsWith("Test.java") || 
               filename.endsWith("IT.java") || 
               filename.endsWith("Tests.java");
    }

    private createEmptyResult(): TestResult {
        return {
            success: false,
            totalTests: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            failures: []
        };
    }
}
