import type { AppConfig } from "../types/config";

export interface Command {
    execute(config: AppConfig): Promise<void>;
}
