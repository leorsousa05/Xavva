# XAVVA - Contexto de Desenvolvimento 🚀

Este documento fornece orientações técnicas e arquiteturais sobre o projeto XAVVA para auxiliar agentes de IA e desenvolvedores.

## 📌 Visão Geral do Projeto
Xavva é uma CLI de alto desempenho construída com **Bun** e **TypeScript**, focada em automatizar e acelerar o ciclo de desenvolvimento de aplicações Java (Maven/Gradle) rodando no Apache Tomcat, especificamente em ambientes **Windows**.

### Tecnologias Principais
- **Runtime:** [Bun](https://bun.sh/) (utilizado para execução, gerenciamento de pacotes e build).
- **Linguagem:** TypeScript (Configurado para ESNext).
- **Integração:** PowerShell (para automação de sistema e browser).
- **Ecossistema Alvo:** Java EE, Apache Tomcat, Maven e Gradle.

---

## 🏗️ Arquitetura do Sistema

O projeto segue uma estrutura modular baseada em comandos e serviços:

### Comandos (`src/commands/`)
Implementação do **Command Pattern**. Cada arquivo representa uma ação da CLI:
- `DeployCommand`: Gerencia o deploy incremental e total no Tomcat.
- `BuildCommand`: Orquestra o build via Maven ou Gradle.
- `StartCommand`: Inicia o servidor Tomcat.
- `RunCommand`: Executa classes Java standalone (suporta modo `debug` com JDWP na porta 5005).
- `AuditCommand`: Realiza auditoria de vulnerabilidades em dependências JAR via OSV.dev.
- `DocsCommand`: Gera documentação de API (Swagger-like) via análise estática de código.
- `LogsCommand`: Faz o tail dos logs do Tomcat.
- `DoctorCommand`: Diagnostica e corrige problemas no ambiente (JDK, Tomcat, BOM).

### Serviços (`src/services/`)
Lógica de negócio reutilizável:
- `TomcatService`: Ciclo de vida e gerenciamento de diretórios do servidor.
- `BuildService`: Execução de comandos de build e detecção de ferramentas.
- `BuildCacheService`: Gerencia invalidação de cache via hash MD5 dos arquivos de configuração (`pom.xml`, `build.gradle`).
- `AuditService`: Extração de metadados de JARs (PowerShell) e consulta a bases de vulnerabilidades.
- `EndpointService`: Analisador estático de código Java para mapeamento de rotas e parâmetros.

### Utilitários (`src/utils/`)
- `ui.ts`: Identidade visual, logs coloridos (`Logger`) e spinners.
- `config.ts`: Gerenciamento centralizado de configurações e parsing de argumentos.

---

## ⚙️ Conceitos Chave e Mecanismos

1. **Diretório `.xavva/`**: Localizado na raiz do projeto Java, armazena metadados, histórico de execução, caches de build e o "Pathing JAR".
2. **Watch Mode Inteligente**: O `index.ts` monitora mudanças:
   - Alteração em `pom.xml`/`build.gradle`: Limpa cache e força build completo.
   - Alteração em `.java`: Dispara deploy incremental de classes.
   - Alteração em recursos (`.jsp`, `.css`, etc): Sincroniza apenas o arquivo modificado.
3. **Pathing JAR (Windows)**: O `RunCommand` gera um JAR temporário contendo apenas o `Class-Path` no manifesto para evitar o erro de "Command line too long" ao lidar com muitos JARs de dependência.
4. **Segurança (Audit)**: Integração com a API **OSV.dev** para checar vulnerabilidades conhecidas em dependências Maven de forma assíncrona.

---

## 📏 Convenções de Desenvolvimento

1. **Processos Externos**: Utilize `Bun.spawn` ou `Bun.spawnSync`. Para comandos que exigem `stdio: inherit` (como `java`), use `child_process.spawn`.
2. **Compatibilidade Windows**: Scripts complexos devem usar PowerShell. Caminhos de arquivos devem ser tratados com `path.join` e normalizados para evitar problemas com barras invertidas (`\`).
3. **Logs**: Nunca use `console.log`. Utilize as funções do `Logger` (`section`, `success`, `warn`, `error`, `watcher`).
4. **Metadados**: Novos comandos que precisem persistir estado local devem utilizar a pasta `.xavva/`.

---

## 🔍 Pontos de Atenção para IA
- O `EndpointService` faz parsing de strings para detectar anotações como `@RequestMapping`, `@GetMapping`, etc. Não depende de reflexão em tempo de execução.
- O `AuditService` extrai `pom.properties` de dentro dos JARs usando `System.IO.Compression` via PowerShell para identificar versões exatas sem depender do nome do arquivo.
- O projeto detecta automaticamente o build tool baseado na presença de arquivos de configuração na raiz.
