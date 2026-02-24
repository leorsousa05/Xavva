# XAVVA 🚀 (Windows Only) `v1.7.0`

Xavva é uma CLI de alto desempenho construída com **Bun** para automatizar o ciclo de desenvolvimento de aplicações Java (Maven/Gradle) rodando no Apache Tomcat. Ela foi desenhada especificamente para desenvolvedores que buscam a velocidade de ambientes modernos (como Node.js/Vite) dentro do ecossistema Java Enterprise.

---

## 🛠️ Por que Xavva?

Desenvolver para Java/Tomcat tradicionalmente envolve ciclos lentos de `clean install`, `war deploy` e restarts de servidor. O Xavva quebra esse paradigma ao introduzir um fluxo de **Hot-Reload incremental**, onde apenas o que mudou é enviado ao servidor.

### ⚡ Funcionalidades de Elite

- **Ultra-Fast Hot Swap**: Compilação incremental e injeção direta de arquivos `.class` e recursos (JSP, HTML, CSS, JS) no Tomcat em execução sem restart.
- **DCEVM Integration**: O Xavva pode baixar e configurar automaticamente uma JDK com DCEVM (JetBrains Runtime), permitindo mudanças estruturais em classes (novos métodos/campos) em tempo real.
- **API Documentation (Swagger-like)**: Mapeamento estático de endpoints, métodos HTTP e parâmetros diretamente no terminal via `xavva docs`.
- **Live Reload Automático**: Sincronização inteligente que atualiza o browser (Chrome/Edge) após mudanças em JSPs ou recursos estáticos.
- **Segurança Proativa**: Auditoria de dependências (`.jar`) em busca de vulnerabilidades conhecidas (CVEs).
- **Auto-Healing**: Diagnóstico e reparo automático de problemas comuns de ambiente, como encoding UTF-8 com BOM.

---

## 🚀 Começo Rápido

### Pré-requisitos
- **Windows** (Otimizado para PowerShell)
- **Bun** instalado (`powershell -c "irm bun.sh/install.ps1 | iex"`)
- **Tomcat** configurado via variável de ambiente `TOMCAT_HOME` ou `CATALINA_HOME`.

### Instalação
```powershell
# Instalação global via NPM
npm install -g @archznn/xavva

# Ou use diretamente via npx
npx @archznn/xavva dev
```

---

## 📖 Referência de Comandos

O Xavva é inteligente: ele detecta automaticamente se seu projeto usa **Maven** (`pom.xml`) ou **Gradle** (`build.gradle`).

### 1. Modo Desenvolvimento (`xavva dev`)
O comando principal para o dia a dia. Ativa o monitoramento de arquivos e o Hot-Reload.
- **O que faz**: Compila Java, sincroniza recursos, limpa logs, inicia o Tomcat e monitora mudanças.
- **Flags úteis**: 
  - `--no-build`: Pula o build inicial.
  - `--port 8081`: Define uma porta específica para o Tomcat.

### 2. Documentação de API (`xavva docs`)
Gera uma documentação instantânea dos seus controladores Jersey/Spring no terminal.
- Mostra a URL completa, método HTTP e parâmetros (Path, Query, Body).

### 3. Diagnóstico e Reparo (`xavva doctor`)
Verifica se o seu ambiente está saudável.
- **`xavva doctor --fix`**:
  - Instala o **JetBrains Runtime (DCEVM)** se necessário.
  - Remove automaticamente o **BOM (Byte Order Mark)** de arquivos Java que causam erros de compilação.
  - Configura o `JAVA_HOME` do sistema.

### 4. Auditoria de Segurança (`xavva audit`)
Analisa a pasta `WEB-INF/lib` em busca de JARs vulneráveis. Essencial para manter a integridade do projeto antes de deploys em produção.

### 5. Debug Mode (`xavva debug`)
Inicia o Tomcat com a porta de debug JPDA ativa (padrão 8000), permitindo que você anexe seu Eclipse/IntelliJ/VS Code instantaneamente.

### 6. Logs em Tempo Real (`xavva logs`)
Exibe os logs do Tomcat filtrando ruídos excessivos e destacando StackTraces importantes. Use `--grep "NomeDaClasse"` para focar em logs específicos.

---

## ⚙️ Configuração (Zero Config)

O Xavva funciona sem arquivos de configuração externos, baseando-se no ambiente:

| Variável | Descrição |
|----------|-----------|
| `TOMCAT_HOME` | Caminho raiz do seu Apache Tomcat. |
| `JAVA_HOME` | JDK utilizada para compilação e execução. |

**Dica**: O Xavva cria automaticamente uma pasta `.xavva` no seu projeto para cache e logs, e a adiciona ao seu `.gitignore`.

---

## 🧩 Sincronização de Recursos

Ao editar um arquivo, o Xavva decide a melhor estratégia:
- **`.java`**: Compila apenas a classe e injeta o bytecode.
- **`.jsp` / `.html` / `.css`**: Sincroniza o arquivo diretamente na pasta de deploy do Tomcat e avisa o browser para atualizar.
- **`pom.xml`**: Identifica que uma mudança estrutural ocorreu e sugere um rebuild completo.

---
*Desenvolvido para transformar o legado em produtivo. 🚀*
