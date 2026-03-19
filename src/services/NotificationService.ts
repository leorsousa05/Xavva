import { exec } from "child_process";
import { promisify } from "util";
import { platform } from "os";

const execAsync = promisify(exec);

export interface NotificationOptions {
    title: string;
    message: string;
    type?: "info" | "success" | "warning" | "error";
    sound?: boolean;
}

export class NotificationService {
    private static enabled = true;

    static disable(): void {
        this.enabled = false;
    }

    static enable(): void {
        this.enabled = true;
    }

    static async notify(options: NotificationOptions): Promise<void> {
        if (!this.enabled) return;

        const { title, message, type = "info", sound = false } = options;

        try {
            if (platform() === "win32") {
                await this.notifyWindows(title, message, type, sound);
            } else if (platform() === "darwin") {
                await this.notifyMacOS(title, message, type, sound);
            } else {
                await this.notifyLinux(title, message, type, sound);
            }
        } catch {
            // Silently fail - notifications are not critical
        }
    }

    private static async notifyWindows(
        title: string, 
        message: string, 
        type: string, 
        sound: boolean
    ): Promise<void> {
        // Use PowerShell notification
        const iconMap: Record<string, string> = {
            info: "Information",
            success: "Information",
            warning: "Warning",
            error: "Error"
        };

        const psScript = `
            Add-Type -AssemblyName System.Windows.Forms
            $notify = New-Object System.Windows.Forms.NotifyIcon
            $notify.Icon = [System.Drawing.SystemIcons]::${iconMap[type]}
            $notify.BalloonTipTitle = "${title.replace(/"/g, '""')}"
            $notify.BalloonTipText = "${message.replace(/"/g, '""')}"
            $notify.BalloonTipIcon = "${iconMap[type]}"
            $notify.Visible = $true
            $notify.ShowBalloonTip(5000)
        `;

        await execAsync(`powershell -Command "${psScript}"`);
    }

    private static async notifyMacOS(
        title: string, 
        message: string, 
        _type: string, 
        sound: boolean
    ): Promise<void> {
        const soundFlag = sound ? '"\\"\\""' : "";
        await execAsync(`osascript -e 'display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"${soundFlag}'`);
    }

    private static async notifyLinux(
        title: string, 
        message: string, 
        type: string, 
        _sound: boolean
    ): Promise<void> {
        const urgencyMap: Record<string, string> = {
            info: "normal",
            success: "normal",
            warning: "normal",
            error: "critical"
        };

        const iconMap: Record<string, string> = {
            info: "dialog-information",
            success: "dialog-information",
            warning: "dialog-warning",
            error: "dialog-error"
        };

        try {
            await execAsync(`notify-send -u ${urgencyMap[type]} -i ${iconMap[type]} "${title}" "${message}"`);
        } catch {
            // Fallback: try zenity
            try {
                await execAsync(`zenity --info --title="${title}" --text="${message}" --timeout=5`);
            } catch {
                // No notification available
            }
        }
    }

    // Convenience methods
    static buildSuccess(duration: number): Promise<void> {
        return this.notify({
            title: "Xavva - Build Completo",
            message: `Build finalizado com sucesso em ${duration.toFixed(1)}s`,
            type: "success"
        });
    }

    static buildFailed(error: string): Promise<void> {
        return this.notify({
            title: "Xavva - Build Falhou",
            message: error.slice(0, 100),
            type: "error"
        });
    }

    static deployComplete(appName: string): Promise<void> {
        return this.notify({
            title: "Xavva - Deploy Completo",
            message: `${appName} implantado com sucesso`,
            type: "success"
        });
    }

    static watchReady(): Promise<void> {
        return this.notify({
            title: "Xavva - Watch Mode",
            message: "Monitorando alterações nos arquivos...",
            type: "info"
        });
    }
}
