import type { Command } from "./Command";
import type { AppConfig, CLIArguments } from "../types/config";
import pkg from "../../package.json";

export class HelpCommand implements Command {
    async execute(_config: AppConfig, _args?: CLIArguments): Promise<void> {
        console.log(`
🛠️  XAVVA CLI v${pkg.version} 🚀
---------------------------------------
Automatização de alta performance para Java Enterprise (Tomcat) no Windows.
Detecta automaticamente Maven/Gradle e otimiza o ciclo de desenvolvimento.

Comandos principais:
  dev           🚀 MODO COMPLETO: Build + Deploy + Watch + Debug.
  deploy        (Padrão) Compila, sincroniza e inicia o servidor.
  logs          📋 Tail inteligente (catalina.out) com Smart Folding.
  run / debug   🚀 Executa classes standalone com Pathing JAR (Windows).
  doctor        🩺 Diagnóstico e reparo de ambiente (DCEVM, JAVA_HOME).
  audit         🛡️ Auditoria de segurança em JARs via OSV.dev.
  docs          📖 Mapeamento estático de Endpoints e JSPs.
  build / start Comandos granulares de compilação ou startup.

Opções de Interface:
  --tui         🖥️  Ativa o Dashboard Interativo (Interface TUI).
                No modo TUI use: [R] Restart, [L] Clear, [Q] Quit.
  -w, --watch   👀 Hot Reload: Redeploy incremental de classes e recursos.
  -c, --clean   🧹 Logs coloridos e simplificados (Recomendado).
  -V, --verbose 📣 Exibe logs completos do Maven/Gradle.

Opções de Runtime:
  -d, --debug   🐞 Habilita JPDA Debugging (Porta 5005).
  -P, --profile Define o profile de build (ex: -P prod).
  -s, --no-build Pula o build inicial.
  --fix         🔧 Corrige problemas automaticamente (Doctor).

Configuração:
  O Xavva prioriza o arquivo 'xavva.json' na raiz do projeto.
  Flags de linha de comando: -p (Tomcat Path), -t (Build Tool), -n (WAR Name).

Exemplos:
  xavva dev --tui      Experiência completa com Dashboard.
  xavva run MyClass    Execução standalone com classpath automático.
  xavva audit          Verifica vulnerabilidades conhecidas.

*Transformando o legado em produtivo.*
        `);
    }
}
