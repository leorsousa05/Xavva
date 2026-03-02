import type { AppConfig, CLIArguments } from "../types/config";

export interface Command {
    execute(config: AppConfig, args?: CLIArguments): Promise<void>;
}
