# XAVVA 🚀 (Windows Only) `v1.6.5`

Xavva é uma CLI de alto desempenho construída com **Bun** para automatizar o ciclo de desenvolvimento de aplicações Java (Maven/Gradle) rodando no Apache Tomcat. Ela foi desenhada especificamente para desenvolvedores que buscam a velocidade de ambientes modernos (como Node.js/Vite) dentro do ecossistema Java Enterprise.

> [!IMPORTANT]
> **Compatibilidade:** Atualmente, o Xavva é exclusivo para **Windows**, utilizando integrações nativas com PowerShell e CMD para automação de browser e gerenciamento de processos.

## 🛠️ Funcionalidades de Elite

- **⚡ Ultra-Fast Hot Swap**: Compilação incremental e injeção direta de arquivos `.class` e recursos (JSP, HTML, CSS, JS) no Tomcat em execução sem necessidade de restart.
- **🛠️ Modo Dev Inteligente**: O comando `xavva dev` ativa hot-reload, logs limpos, debugger (JPDA) e monitoramento de memória em um único fluxo.
- **🌐 Live Reload Automático**: Atualiza automaticamente as abas do Chrome ou Edge após o deploy ou sincronização de arquivos, mantendo o foco no código.
- **🔍 API Documentation (Swagger-like)**: O comando `xavva docs` mapeia estaticamente sua API, exibindo endpoints, métodos HTTP e parâmetros (Query, Path, Body) diretamente no terminal.
- **📊 Real-time Log Filtering**: Filtra ruídos excessivos do Tomcat/Jersey/SLF4J, destacando erros Java com dicas de solução e tempo de startup.
- **📈 JVM & Memory Monitor**: Exibe o consumo de RAM (Working Set) do processo do Tomcat em tempo real.
- **🩺 Doctor Mode**: Diagnostica o ambiente (Java, Tomcat, Maven, Gradle) e corrige automaticamente problemas de **Encoding (UTF-8 BOM)** que podem causar falhas silenciosas no Java.
- **🛡️ JAR Audit**: O comando `xavva audit` analisa todas as dependências (`.jar`) da sua aplicação e verifica vulnerabilidades conhecidas (CVEs) usando o banco de dados **OSV.dev**.

## 🚀 Zero Config & Auto-Detection

O Xavva foi evoluído para um modelo **Zero Config**. Você não precisa mais de arquivos de configuração para começar.

- **Auto-Detecção:** O Xavva identifica automaticamente se seu projeto usa **Maven** (`pom.xml`) ou **Gradle** (`build.gradle`) ao ser executado na raiz.
- **Ambiente Inteligente:** Ele utiliza as variáveis de ambiente `TOMCAT_HOME` ou `CATALINA_HOME` para localizar o servidor.
- **Prioridade CLI:** Qualquer parâmetro passado via linha de comando (como `--path` ou `--port`) tem precedência total sobre o ambiente.

### Comandos Principais

```bash
# Inicia o modo de desenvolvimento completo (Auto-detecta Maven/Gradle)
xavva dev

# Define o Tomcat e o Profile manualmente via CLI
xavva dev -p C:\tomcat-9 -P production

# Exibe a documentação da API
xavva docs

# Audita vulnerabilidades nas dependências JAR do app
xavva audit

# Diagnostica o ambiente e limpa arquivos com BOM (UTF-8 signature)
xavva doctor --fix
```

### Opções Úteis

- `-p, --path <path>`: Caminho customizado do Tomcat (Sobrescreve TOMCAT_HOME).
- `-P, --profile <nome>`: Define o profile do Maven/Gradle (ex: dev, prod).
- `-t, --tool <maven|gradle>`: Força o uso de uma ferramenta específica.
- `-n, --name <nome>`: Define o nome do contexto da aplicação.
- `-w, --watch`: Ativa o monitoramento de arquivos para hot-reload.
- `-d, --debug`: Habilita o Java Debugger na porta 5005.

## 📦 Stack Tecnológica

- **Runtime:** [Bun](https://bun.sh/) (Engine de alta performance)
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/)
- **Automação:** PowerShell & CMD (Integração nativa Windows)
- **CI/CD:** GitHub Actions para geração de binários multi-plataforma (via Bun Compile)

---
*Desenvolvido para transformar a experiência de desenvolvimento Java Legacy em algo ágil e produtivo.*
