import { Logger } from "../utils/ui";

export class BrowserService {
    /**
     * Recarrega a aba ativa do browser (Chrome ou Edge) no Windows.
     */
    public static async reload(url: string) {
        if (process.platform !== 'win32') return;
        
        // Pequeno delay para garantir que o Tomcat processou o novo contexto
        await new Promise(r => setTimeout(r, 800));

        const psCommand = `
            $shell = New-Object -ComObject WScript.Shell
            $process = Get-Process | Where-Object { $_.MainWindowTitle -match "Chrome" -or $_.MainWindowTitle -match "Edge" } | Select-Object -First 1
            if ($process) {
                $shell.AppActivate($process.Id)
                Sleep -m 100
                $shell.SendKeys("{F5}")
            }
        `;
        
        try {
            Bun.spawn(["powershell", "-command", psCommand]);
        } catch (e) {
            Logger.warn("Não foi possível recarregar o browser automaticamente.");
        }
    }

    /**
     * Abre a URL no browser padrão do sistema.
     */
    public static open(url: string) {
        if (process.platform === 'win32') {
            Bun.spawn(["cmd", "/c", "start", url]);
        } else {
            const start = process.platform === 'darwin' ? 'open' : 'xdg-open';
            Bun.spawn([start, url]);
        }
    }
}
