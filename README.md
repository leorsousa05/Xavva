# XAVVA 🚀 (Windows Only) `v2.0.2`

Xavva é uma CLI de alto desempenho construída com **Bun** para automatizar o ciclo de desenvolvimento de aplicações Java (Maven/Gradle) rodando no Apache Tomcat. Ela foi desenhada especificamente para desenvolvedores que buscam a velocidade de ambientes modernos (como Node.js/Vite) dentro do ecossistema Java Enterprise.

---

## 🛠️ Por que Xavva?

Desenvolver para Java/Tomcat tradicionalmente envolve ciclos lentos de `clean install`, `war deploy` e restarts de servidor. O Xavva quebra esse paradigma ao introduzir um fluxo de **Hot-Reload incremental**, onde apenas o que mudou é enviado ao servidor.

### ⚡ Funcionalidades de Elite

- **Interactive Dashboard (TUI)**: Um painel em tempo real (`--tui`) com métricas de sistema, status do servidor e atalhos rápidos (Restart, Clear, Quit).
- **Smart Log Analyzer**: Logs inteligentes que escondem ruídos do framework (Stack Folding) e destacam a causa raiz de erros Java.
- **Ultra-Fast Hot Swap**: Compilação incremental e injeção direta de arquivos `.class` e recursos (JSP, HTML, CSS, JS) no Tomcat em execução sem restart.
- **Gradle & Maven Native**: Suporte robusto para ambos os ecossistemas, incluindo extração automática de classpath para execução de classes standalone (`run`/`debug`).
- **Segurança & Robustez**: Auditoria de dependências (`.jar`) e execução protegida contra *Command Injection* no PowerShell.
- **Pathing JAR (Windows)**: Contorna limites de caracteres do Windows em classpaths gigantes.
- **Auto-Healing**: Diagnóstico e reparo automático de problemas comuns de ambiente.

---

## 🚀 Começo Rápido

### Instalação
```powershell
# Instalação global via NPM
npm install -g @archznn/xavva

# Iniciar em modo Dashboard (TUI)
xavva dev --tui
```

---

## 📖 Referência de Comandos

O Xavva 2.0 utiliza uma arquitetura modular de comandos e serviços.

### 1. Modo Desenvolvimento (`xavva dev`)
O comando principal para o dia a dia. Ativa o monitoramento de arquivos e o Hot-Reload.
- **Flags úteis**: 
  - `--tui`: Ativa o Dashboard interativo no terminal.
  - `--no-build`: Pula o build inicial.
  - `--watch`: Ativa o modo de observação de arquivos (padrão em `dev`).
  - `--port 8081`: Define uma porta específica para o Tomcat.

### 2. Configuração de Projeto (`xavva.json`)
Crie um arquivo `xavva.json` na raiz do seu projeto para salvar suas configurações:
```json
{
  "project": {
    "appName": "meu-app",
    "buildTool": "maven",
    "tui": true
  },
  "tomcat": {
    "port": 8080
  }
}
```

### 3. Execução de Classes (`xavva run` / `xavva debug`)
Executa classes Java standalone (`public static void main`) com resolução automática de dependências.

---

## 🏗️ Arquitetura Xavva 2.0

O Xavva foi refatorado para uma arquitetura de **Injeção de Dependências** e **Serviços Centralizados**:

- **DashboardService**: Gerenciamento de interface TUI e interatividade.
- **LogAnalyzer**: Processamento inteligente de logs e stack traces.
- **ProjectService**: Inteligência centralizada para descoberta de diretórios e artefatos.
- **CommandRegistry**: Despacho modular de comandos.

---
*Desenvolvido para transformar o legado em produtivo. 🚀*
