🚀 Xavva (Tomcat Deployer CLI)
Uma ferramenta de automação de alto desempenho para desenvolvedores Java que precisam compilar, limpar portas e realizar o deploy de aplicações Spring Boot em servidores Apache Tomcat localmente, agora com suporte a **Hot Reload**.

📁 Estrutura do Projeto
```plaintext
xavva/
├── src/
│   ├── services/
│   │   ├── BuildService.ts   # Orquestra Maven/Gradle e manipulação de arquivos .war
│   │   └── TomcatService.ts  # Gerencia o processo do Tomcat, logs e limpeza de portas
│   └── index.ts              # Ponto de entrada (Orquestrador)
├── config.ts                 # Configurações padrão de ambiente
├── package.json              # Definições do projeto e dependências
└── README.md                 # Documentação
```

🛠️ Pré-requisitos
- **Bun Runtime**: Instalação via PowerShell (`powershell -c "irm bun.sh/install.ps1 | iex"`)
- **Java JDK & Maven/Gradle**: Configurados no seu PATH do Windows.
- **Apache Tomcat**: Instalado localmente.

⚙️ Configuração
Você pode ajustar as configurações padrão no arquivo `config.ts` ou sobrescrevê-las via argumentos da CLI.

```typescript
export const config = {
    tomcat: {
        path: 'C:\\caminho\\para\\seu\\tomcat',
        port: 8080,
        webapps: 'webapps',
    },
    project: {
        appName: 'meu-projeto',
        buildTool: 'maven', // 'maven' ou 'gradle'
    }
};
```

🚀 Como Usar

### Instalação
Para instalar as dependências e linkar o executável globalmente (opcional):
```bash
bun install
bun link
```

### Comandos da CLI
Você pode rodar a ferramenta diretamente com `bun src/index.ts` ou `xavva` (se linkado).

#### Ajuda
Exibe todos os comandos disponíveis.
```bash
xavva --help
```

#### Hot Reload (Modo Watch) 🔥
Monitora alterações nos arquivos do projeto Java e refaz o deploy automaticamente.
**Agora com Builds Incrementais:** A primeira execução faz um build limpo (`clean package`), mas as recargas subsequentes pulam a etapa de limpeza para serem muito mais rápidas.
```bash
xavva --watch
# ou
xavva -w
```
*Ignora automaticamente pastas como `target`, `build`, `.git` e `node_modules`.*

#### Outras Opções
| Flag | Descrição | Exemplo |
|------|-----------|---------|
| `-p`, `--path` | Caminho base do Tomcat | `xavva -p "C:\Tomcat"` |
| `-t`, `--tool` | Ferramenta de build | `xavva -t gradle` |
| `-n`, `--name` | Nome do arquivo .war final | `xavva -n app-v2` |
| `--port` | Porta do servidor | `xavva --port 8081` |
| `-s`, `--no-build` | Pula a etapa de compilação (apenas deploy) | `xavva -s` |
| `-c`, `--clean` | Logs do Tomcat simplificados e coloridos | `xavva -c` |

### Exemplos de Uso

**Ciclo Completo (Padrão)**
Build + Kill Port + Deploy + Start
```bash
xavva
```

**Modo Desenvolvimento Rápido**
Sem build (apenas deploy do war existente), logs limpos e hot reload.
```bash
xavva -s -c -w
```

**Sobrescrevendo Configurações**
Deploy de um projeto Gradle em um Tomcat específico na porta 9090.
```bash
xavva -t gradle -p "D:\Servers\Tomcat9" --port 9090
```

🔄 Fluxo de Funcionamento Interno
1. **Kill Port**: Verifica se a porta definida está em uso e mata o processo (evita `java.net.BindException`).
2. **Build**: Executa `mvn clean package` ou `gradle build`. No **Modo Watch**, builds subsequentes omitem o `clean` para performance.
3. **Deploy**: Move o artefato gerado para a pasta `webapps` do Tomcat.
4. **Start**: Inicia o Tomcat e redireciona a saída para o terminal.
5. **Watch (Opcional)**: Se ativado, aguarda alterações no código fonte para reiniciar o ciclo a partir do passo 1 (parando o servidor atual antes).

⚠️ Observações
- **Permissões**: Certifique-se de ter permissões para matar processos (`taskkill`) e escrever na pasta do Tomcat.
- **Spring Boot**: Para deploy em Tomcat externo, lembre-se de estender `SpringBootServletInitializer` na sua classe principal.