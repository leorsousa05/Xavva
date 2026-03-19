import { Logger } from "../utils/ui";
import { isWindows, getOpenBrowserArgs } from "../utils/platform";

export class BrowserService {
    private static debugPort = 9222;

    /**
     * Recarrega a aba do browser que corresponde à URL da aplicação.
     * Usa o Chrome DevTools Protocol (CDP) para encontrar e recarregar a aba correta.
     * Nota: No Linux/Mac, esta funcionalidade é limitada.
     */
    public static async reload(url: string) {
        // Pequeno delay para garantir que o Tomcat processou o novo contexto
        await new Promise(r => setTimeout(r, 800));

        if (!isWindows()) {
            return;
        }

        // Usar heredoc para evitar problemas de escaping
        const psCommand = `
$ErrorActionPreference = 'SilentlyContinue'
$debugPort = ${this.debugPort}

function Reload-TabByUrl {
    param($targetUrl, $port)
    
    try {
        $pages = Invoke-RestMethod -Uri "http://localhost:$port/json/list" -TimeoutSec 2
        $targetUri = [System.Uri]$targetUrl
        $targetPath = $targetUri.AbsolutePath.TrimEnd('/')
        
        foreach ($page in $pages) {
            if ($page.type -ne "page") { continue }
            
            try {
                $pageUri = [System.Uri]$page.url
                if ($pageUri.Host -eq $targetUri.Host -and 
                    $pageUri.AbsolutePath.TrimEnd('/') -eq $targetPath) {
                    
                    $body = @{ id = 1; method = "Page.reload"; params = @{ ignoreCache = $false } } | ConvertTo-Json -Compress
                    Invoke-RestMethod -Uri "http://localhost:$port/json/reload/$($page.id)" -Method Put -Body $body -ContentType "application/json" -TimeoutSec 2 | Out-Null
                    return $true
                }
            } catch { continue }
        }
    } catch { }
    return $false
}

$reloaded = Reload-TabByUrl -targetUrl "${url}" -port $debugPort

if (-not $reloaded) {
    $shell = New-Object -ComObject WScript.Shell
    $urlObj = [System.Uri]"${url}"
    $context = $urlObj.AbsolutePath.Trim('/').Split('/')[0]
    
    $processes = Get-Process | Where-Object { 
        ($_.Name -eq "chrome" -or $_.Name -eq "msedge") -and 
        $_.MainWindowTitle -and
        ($_.MainWindowTitle -match $context -or $_.MainWindowTitle -match "localhost")
    }
    
    if ($processes) {
        $targetProcess = $processes | Select-Object -First 1
        $shell.AppActivate($targetProcess.Id)
        Start-Sleep -Milliseconds 100
        $shell.SendKeys("{F5}")
    } else {
        $anyBrowser = Get-Process | Where-Object { 
            $_.Name -eq "chrome" -or $_.Name -eq "msedge" 
        } | Select-Object -First 1
        
        if ($anyBrowser) {
            $shell.AppActivate($anyBrowser.Id)
            Start-Sleep -Milliseconds 100
            $shell.SendKeys("{F5}")
        }
    }
}
`;
        
        try {
            Bun.spawn(["powershell", "-command", psCommand]);
        } catch (e) {
            Logger.warn("Não foi possível recarregar o browser automaticamente.");
        }
    }

    /**
     * Abre a URL no browser com remote debugging habilitado (se possível).
     * Isso permite recarregar a aba específica posteriormente via CDP.
     */
    public static open(url: string) {
        if (!isWindows()) {
            const args = getOpenBrowserArgs(url);
            Bun.spawn(args);
            return;
        }

        const psCommand = `
$ErrorActionPreference = 'SilentlyContinue'
$debugPort = ${this.debugPort}
$targetUrl = "${url}"

$debuggingEnabled = $false
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:$debugPort/json/version" -TimeoutSec 1
    $debuggingEnabled = $true
} catch { }

# Encontra o executável do Chrome ou Edge
$browserExe = $null
$chromePaths = @(
    ("$env:ProgramFiles" + "\\Google\\Chrome\\Application\\chrome.exe"),
    ("$env:LOCALAPPDATA" + "\\Google\\Chrome\\Application\\chrome.exe")
)
$edgePaths = @(
    ("$env:ProgramFiles" + "\\Microsoft\\Edge\\Application\\msedge.exe")
)

foreach ($path in $chromePaths) {
    if (Test-Path $path) { $browserExe = $path; break }
}
if (-not $browserExe) {
    foreach ($path in $edgePaths) {
        if (Test-Path $path) { $browserExe = $path; break }
    }
}

if ($browserExe) {
    if ($debuggingEnabled) {
        try {
            $body = @{ url = $targetUrl } | ConvertTo-Json -Compress
            Invoke-RestMethod -Uri "http://localhost:$debugPort/json/new" -Method Put -Body $body -ContentType "application/json" -TimeoutSec 3 | Out-Null
        } catch {
            Start-Process $browserExe -ArgumentList $targetUrl
        }
    } else {
        Start-Process $browserExe -ArgumentList $targetUrl, "--remote-debugging-port=$debugPort", "--no-first-run"
    }
} else {
    Start-Process $targetUrl
}
`;
        
        try {
            Bun.spawn(["powershell", "-command", psCommand]);
        } catch (e) {
            // Fallback para método padrão
            const args = getOpenBrowserArgs(url);
            Bun.spawn(args);
        }
    }
}
