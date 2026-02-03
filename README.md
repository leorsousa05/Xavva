🚀 Tomcat Deployer CLI (Bun Edition)
Uma ferramenta de automação de alto desempenho para desenvolvedores Java que precisam compilar, limpar portas e realizar o deploy de aplicações Spring Boot em servidores Apache Tomcat localmente.

📁 Estrutura do Projeto
Plaintext
tomcat-deployer/
├── src/
│ ├── services/
│ │ ├── BuildService.ts # Orquestra Maven/Gradle e manipulação de arquivos .war
│ │ └── TomcatService.ts # Gerencia o processo do Tomcat e limpeza de portas
│ └── index.ts # Ponto de entrada (Orquestrador)
├── config.ts # Configurações de ambiente e caminhos
├── package.json # Definições do projeto e scripts
└── README.md # Documentação (este arquivo)
🛠️ Pré-requisitos
Bun Runtime: Instalação via PowerShell

Java JDK & Maven/Gradle: Configurados no seu PATH do Windows.

Apache Tomcat: Instalado localmente.

⚙️ Configuração (config.ts)
Antes de rodar, ajuste os caminhos no arquivo de configuração raiz:

TypeScript
export const config = {
tomcat: {
path: 'C:\\Users\\guilh\\apache-tomcat', // Raiz do seu Tomcat
port: 8080, // Porta padrão do conector HTTP
webapps: 'webapps', // Pasta de destino
},
project: {
appName: 'meu-projeto', // Nome final do arquivo no Tomcat (contexto)
buildTool: 'maven', // Opções: 'maven' | 'gradle'
}
};
🔄 Fluxo de Funcionamento
O deployer executa quatro etapas críticas em sequência:

Kill Port: Executa um netstat para encontrar o PID que está utilizando a porta do Tomcat e encerra o processo (taskkill). Isso evita o erro java.net.BindException.

Build: Invoca a ferramenta de build (mvn clean package) para gerar o artefato .war mais recente.

Deploy: Localiza o arquivo na pasta target ou build/libs e o move para a pasta webapps do Tomcat, renomeando-o conforme a configuração.

Start: Inicia o arquivo catalina.bat run e espelha os logs do servidor no seu terminal.

🚀 Como Usar
Instalação de dependências
Como o projeto usa apenas APIs nativas do Bun e módulos de compatibilidade do Node, basta iniciar o projeto:

Bash
bun init -y
Executando o Deployer
Para rodar o ciclo completo (Build + Deploy + Start):

Bash
bun src/index.ts
Criando um Atalho (Windows)
Crie um arquivo deploy.bat na raiz:

Snippet de código
@echo off
bun src/index.ts
pause
⚠️ Observações Importantes (Troubleshooting)
Permissões: Certifique-se de que o terminal tem permissão para executar o taskkill (pode exigir execução como Administrador se o Tomcat foi instalado em C:\Program Files).

Spring Boot: Seu projeto Java deve estender SpringBootServletInitializer para ser compatível com o Tomcat externo.

Conflitos de Arquivo: Se o arquivo .war estiver travado pelo Tomcat, o script de killConflict deve ser executado antes de qualquer tentativa de cópia.
