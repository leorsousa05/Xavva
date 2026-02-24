# XAVVA 🚀 (Windows Only) `v1.7.0`

Xavva é uma CLI de alto desempenho construída com **Bun** para automatizar o ciclo de desenvolvimento de aplicações Java (Maven/Gradle) rodando no Apache Tomcat. Ela foi desenhada especificamente para desenvolvedores que buscam a velocidade de ambientes modernos (como Node.js/Vite) dentro do ecossistema Java Enterprise.

## 🛠️ Funcionalidades de Elite

- **⚡ Ultra-Fast Hot Swap**: Compilação incremental e injeção direta de arquivos `.class` e recursos (JSP, HTML, CSS, JS) no Tomcat em execução sem necessidade de restart.
- **📦 Multi-Module Support**: Detecção recursiva de diretórios de classes em projetos complexos, garantindo que o Hot-Reload funcione entre diferentes módulos.
- **🛠️ Modo Dev Inteligente**: O comando `xavva dev` ativa hot-reload, logs limpos, debugger (JPDA) e monitoramento de memória em um único fluxo.
- **🌐 Live Reload Automático**: Atualiza automaticamente as abas do Chrome ou Edge após o deploy ou sincronização de arquivos, mantendo o foco no código.
- **🔍 API Documentation (Swagger-like)**: O comando `xavva docs` mapeia estaticamente sua API, exibindo endpoints, métodos HTTP e parâmetros diretamente no terminal.
- **📊 Real-time Log Filtering**: Filtra ruídos excessivos do Tomcat/Jersey/SLF4J, destacando erros Java com dicas de solução.
- **📈 JVM & Memory Monitor**: Exibe o consumo de RAM do processo do Tomcat em tempo real.
- **🩺 Doctor Mode**: Diagnostica o ambiente e corrige automaticamente problemas de **Encoding (UTF-8 BOM)**.
- **🛡️ JAR Audit**: Analisa todas as dependências (`.jar`) da sua aplicação em busca de vulnerabilidades (CVEs).

## 🚀 Instalação e Uso

```bash
# Instalação global
npm install -g @archznn/xavva

# Ou rodar sem instalar via npx
npx @archznn/xavva dev
```

## ⚙️ Zero Config & Auto-Detection

O Xavva identifica automaticamente se seu projeto usa **Maven** (`pom.xml`) ou **Gradle** (`build.gradle`) e localiza o Tomcat através das variáveis `TOMCAT_HOME` ou `CATALINA_HOME`.

### Comandos Principais

```bash
xavva dev          # Modo desenvolvimento completo com Hot-Reload
xavva docs         # Documentação estática de endpoints
xavva audit        # Auditoria de segurança de dependências
xavva doctor --fix # Diagnóstico e reparo de ambiente
```

---
*Desenvolvido para transformar a experiência de desenvolvimento Java Legacy em algo ágil e produtivo.*
