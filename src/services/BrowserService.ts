import { Logger } from "../utils/ui";
import { isWindows, getOpenBrowserArgs } from "../utils/platform";

export class BrowserService {
    /**
     * Recarrega a aba ativa do browser (Chrome ou Edge).
     * Nota: No Linux/Mac, esta funcionalidade é limitada devido às restrições
     * de automação de GUI. Recomenda-se usar extensões de Live Reload.
     */
    public static async reload(url: string) {
        // Pequeno delay para garantir que o Tomcat processou o novo contexto
        await new Promise(r => setTimeout(r, 800));

        if (!isWindows()) {
            // No Linux/Mac, tenta notificar via Browser Sync ou similar se disponível
            // Por enquanto, apenas loga (o usuário pode usar extensões de Live Reload)
            return;
        }

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
        const args = getOpenBrowserArgs(url);
        Bun.spawn(args);
    }
}
