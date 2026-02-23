# XAVVA 🚀 (Windows Only)

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
- **🩺 Doctor Mode**: Diagnostica rapidamente o ambiente (Java, Tomcat, Maven, Gradle) para garantir que tudo está configurado corretamente.

## 🚀 Como Instalar e Usar

O Xavva pode ser baixado como um executável único na aba **Releases** do GitHub ou rodado via Bun.

### Comandos Principais

```bash
# Inicializa um arquivo de configuração no projeto atual
xavva --init

# Inicia o modo de desenvolvimento completo (Build + Deploy + Watch + Logs)
xavva dev

# Exibe a documentação da API e URLs de JSPs
xavva docs

# Executa uma classe Main específica
xavva run br.com.meu.AppMain

# Monitora logs do Tomcat com filtros inteligentes
xavva logs -G "NullPointer"

# Diagnostica o ambiente
xavva doctor
```

### Opções Úteis

- `-w, --watch`: Ativa o monitoramento de arquivos para hot-reload.
- `-d, --debug`: Habilita o Java Debugger (JPDA) na porta 5005.
- `-c, --clean`: Ativa limpeza de cache do Tomcat antes de subir.
- `-q, --quiet`: Mostra apenas mensagens essenciais e erros.
- `-V, --verbose`: Exibe o output completo do Maven/Gradle para debug.
- `-G, --grep <termo>`: Filtra logs em tempo real por uma palavra-chave.
- `-P, --profile <nome>`: Define o profile do Maven/Gradle para o build.

## ⚙️ Configuração

O Xavva busca automaticamente por um arquivo `xavva.config.ts` ou `xavva.json` na raiz do seu projeto Java.

Exemplo de `xavva.config.ts`:

```typescript
export const config = {
    tomcat: {
        path: 'C:\\apache-tomcat-9.0', // Caminho raiz do Tomcat
        port: 8080,                    // Porta do servidor
        webapps: 'webapps',            // Pasta de deploy
    },
    project: {
        appName: 'meu-sistema',        // Nome do contexto (opcional)
        buildTool: 'maven',            // 'maven' ou 'gradle'
        profile: 'dev',                // Profile do build tool
        skipScan: true,                // Pula o TLD scan do Tomcat (mais rápido)
    }
};
```

## 📦 Stack Tecnológica

- **Runtime:** [Bun](https://bun.sh/) (Engine de alta performance)
- **Linguagem:** [TypeScript](https://www.typescriptlang.org/)
- **Automação:** PowerShell & CMD (Integração nativa Windows)
- **CI/CD:** GitHub Actions para geração de binários multi-plataforma (via Bun Compile)

---
*Desenvolvido para transformar a experiência de desenvolvimento Java Legacy em algo ágil e produtivo.*
