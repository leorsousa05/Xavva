import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface HistoryEntry {
    command: string;
    args: string[];
    timestamp: string;
    success: boolean;
    duration?: number;
}

const HISTORY_FILE = join(homedir(), ".xavva", "history.json");
const MAX_HISTORY_SIZE = 100;

export class HistoryService {
    private async ensureDir(): Promise<void> {
        const dir = join(homedir(), ".xavva");
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
    }

    private async load(): Promise<HistoryEntry[]> {
        try {
            await this.ensureDir();
            const data = await readFile(HISTORY_FILE, "utf-8");
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    private async save(entries: HistoryEntry[]): Promise<void> {
        await this.ensureDir();
        // Keep only last MAX_HISTORY_SIZE entries
        const trimmed = entries.slice(-MAX_HISTORY_SIZE);
        await writeFile(HISTORY_FILE, JSON.stringify(trimmed, null, 2));
    }

    async add(entry: Omit<HistoryEntry, "timestamp">): Promise<void> {
        const entries = await this.load();
        entries.push({
            ...entry,
            timestamp: new Date().toISOString()
        });
        await this.save(entries);
    }

    async getRecent(limit: number = 10): Promise<HistoryEntry[]> {
        const entries = await this.load();
        return entries.slice(-limit).reverse();
    }

    async getLast(): Promise<HistoryEntry | null> {
        const entries = await this.load();
        return entries.length > 0 ? entries[entries.length - 1] : null;
    }

    async clear(): Promise<void> {
        await this.save([]);
    }

    async getStats(): Promise<{ total: number; successful: number; failed: number }> {
        const entries = await this.load();
        return {
            total: entries.length,
            successful: entries.filter(e => e.success).length,
            failed: entries.filter(e => !e.success).length
        };
    }
}
