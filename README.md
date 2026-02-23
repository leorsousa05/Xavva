# XAVVA 🚀

Xavva é uma CLI de alto desempenho para automatizar o ciclo de desenvolvimento de aplicações Java (Maven/Gradle) rodando no Apache Tomcat.

## 🛠️ Funcionalidades

- **Ultra-Fast Hot Swap**: Compilação incremental e injeção direta de `.class` no Tomcat sem reiniciá-lo.
- **Modo Dev Inteligente**: `xavva dev` ativa hot-reload, logs limpos, debugger e monitoramento de memória em um único comando.
- **Live Reload**: Atualiza automaticamente as abas do Chrome/Edge (Windows) após o deploy ou sincronização de arquivos JSP/CSS.
- **Interactive Run/Debug**: `xavva run` executa uma classe Main isolada. `xavva debug` abre um Socket JDWP (porta 5005) para você anexar seu IDE preferido.
- **Real-time Logs**: `xavva logs` monitora o `catalina.out` do Tomcat com colorização de erros e suporte a filtros.
- **Endpoint Scanner**: Mapeia todas as URLs (@Path, @RequestMapping) da sua aplicação durante o startup.
- **JVM Monitor**: Exibe o consumo de RAM em tempo real do processo do Tomcat.
- **Git Context**: Banner informativo com a Branch atual e autor do último commit.
- **Clean Logs**: Filtra ruídos do Tomcat/Jersey/SLF4J e destaca erros Java com dicas de solução.

## 🚀 Como Usar

### Comandos Principais

```bash
# Inicia o modo de desenvolvimento completo (recomendado)
xavva dev

# Executa uma classe Main
xavva run br.com.meu.AppMain

# Depura uma classe Main (Aguarda conexão na porta 5005)
xavva debug br.com.meu.AppMain

# Monitora logs do Tomcat em tempo real
xavva logs

# Monitora logs filtrando por erro
xavva logs -G "NullPointer"

# Diagnostica o ambiente (Java, Tomcat, Maven, etc)
xavva doctor

# Apenas builda o projeto
xavva build

# Inicia o Tomcat sem recompilar
xavva start
```

### Opções Úteis

- `-w, --watch`: Ativa o monitoramento de arquivos para hot-reload.
- `-d, --debug`: Habilita o Java Debugger (JPDA) na porta 5005.
- `-c, --clean`: Logs simplificados e coloridos.
- `-q, --quiet`: Mostra apenas mensagens essenciais.
- `-G, --grep <termo>`: Filtra logs em tempo real por uma palavra-chave.
- `-P, --profile <nome>`: Define o profile do Maven/Gradle.

## ⚙️ Configuração

As configurações padrões ficam no arquivo `config.ts` na raiz do projeto:

```typescript
export const config = {
    tomcat: {
        path: 'C:\\caminho\\para\\tomcat',
        port: 8080,
        webapps: 'webapps',
    },
    project: {
        appName: 'meu-app', // Opcional (se vazio usa o nome original do .war)
        buildTool: 'maven', // 'maven' ou 'gradle'
    }
};
```

## 📦 Tecnologias

- [Bun](https://bun.sh/)
- [TypeScript](https://www.typescriptlang.org/)
- [JDB (Java Debugger)](https://docs.oracle.com/javase/8/docs/technotes/tools/windows/jdb.html)
