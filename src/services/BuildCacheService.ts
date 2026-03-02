import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface CacheData {
    lastConfigHash: string;
    lastBuildTime: number;
}

export class BuildCacheService {
    private cacheDir: string;
    private cacheFile: string;

    constructor() {
        this.cacheDir = path.join(process.cwd(), ".xavva");
        this.cacheFile = path.join(this.cacheDir, "build-cache.json");
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    getHash(filePath: string): string {
        if (!fs.existsSync(filePath)) return "";
        const content = fs.readFileSync(filePath);
        return crypto.createHash("md5").update(content).digest("hex");
    }

    getConfigHash(tool: "maven" | "gradle"): string {
        const file = tool === "maven" ? "pom.xml" : "build.gradle";
        const configPath = path.join(process.cwd(), file);
        let hash = this.getHash(configPath);

        // Se for gradle, também checar build.gradle.kts e settings
        if (tool === "gradle") {
            const kts = path.join(process.cwd(), "build.gradle.kts");
            const settings = path.join(process.cwd(), "settings.gradle");
            if (fs.existsSync(kts)) hash += this.getHash(kts);
            if (fs.existsSync(settings)) hash += this.getHash(settings);
        }

        return crypto.createHash("md5").update(hash).digest("hex");
    }

    shouldRebuild(tool: "maven" | "gradle", projectService?: any): boolean {
        if (!fs.existsSync(this.cacheFile)) return true;

        try {
            const currentHash = this.getConfigHash(tool);
            const cache: CacheData = JSON.parse(fs.readFileSync(this.cacheFile, "utf-8"));
            
            // Se o pom/gradle mudou, precisa de rebuild completo
            if (currentHash !== cache.lastConfigHash) return true;

            // Verificar se o artefato (.war) ainda existe fisicamente
            if (projectService) {
                try {
                    const artifact = projectService.getArtifact();
                    if (!fs.existsSync(artifact.path)) return true;
                } catch (e) {
                    return true;
                }
            }

            return false;
        } catch (e) {
            return true;
        }
    }

    saveCache(tool: "maven" | "gradle") {
        const data: CacheData = {
            lastConfigHash: this.getConfigHash(tool),
            lastBuildTime: Date.now()
        };
        fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
    }

    clearCache() {
        if (fs.existsSync(this.cacheFile)) {
            fs.unlinkSync(this.cacheFile);
        }
    }
}
