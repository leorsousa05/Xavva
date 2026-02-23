import type { Command } from "./Command";
import type { AppConfig } from "../types/config";
import pkg from "../../package.json";

export class HelpCommand implements Command {
    async execute(_config: AppConfig): Promise<void> {
        console.log(`
🛠️  Xavva CLI v${pkg.version}
-------------------------------
A Xavva automatiza o ciclo de vida de aplicações Java (Tomcat).
Se nenhum comando for fornecido, 'deploy' será executado por padrão.

Comandos principais:
  dev           🚀 MODO COMPLETO: Deploy + Watch + Debug + Clean.
  deploy        (Padrão) Builda o projeto, move para webapps e inicia o Tomcat.
  start         Apenas inicia o servidor (útil quando o .war já foi gerado).
  build         Executa apenas a compilação (mvn package ou gradle build).
  doctor        🩺 Verifica o ambiente (Java, Tomcat, Maven, etc).
  docs          📖 Swagger-like: Exibe endpoints e URLs de JSPs.
  audit         🛡️ JAR Audit: Busca vulnerabilidades (CVEs) nas dependências.
  run           🚀 Executa uma classe main (Uso: xavva run NomeDaClasse).
  debug         🐞 Debuga uma classe main (Uso: xavva debug NomeDaClasse).
  logs          📋 Monitora o catalina.out do Tomcat em tempo real.

Opções:
  -w, --watch   👀 Hot Reload: monitora arquivos e redeploya automaticamente.
  -d, --debug   🐞 Habilita debug Java (JPDA) na porta 5005.
  -c, --clean   🧹 Logs coloridos e simplificados (recomendado).
  -q, --quiet   🤫 Mostra apenas mensagens essenciais nos logs.
  -V, --verbose 📣 Mostra logs completos do Maven/Gradle.
  -s, --no-build Pula o build (usa o que já estiver na pasta target/build).
  -P, --profile Define o profile (ex: -P prod).

Exemplos de uso:
  xavva dev           A melhor experiência de dev local.
  xavva -w -c         Inicia com auto-reload e logs limpos.
  xavva deploy -d     Builda e inicia com debugger habilitado.
  xavva start -c      Apenas sobe o servidor com logs limpos.
  xavva build -P dev  Apenas compila usando o profile 'dev'.

Opções de Configuração:
  -p, --path    Caminho do Tomcat (padrão via config.ts)
  -t, --tool    Ferramenta (maven/gradle)
  -n, --name    Nome do .war (ex: -n ROOT)
  --port        Porta HTTP (padrão: 8080)
        `);
    }
}
