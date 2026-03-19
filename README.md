# XAVVA CLI 🚀

> Ultra-fast development toolkit for Java Enterprise (Tomcat) on Windows, Linux & macOS

[![Version](https://img.shields.io/badge/version-3.1.3-blue.svg)](https://github.com/leorsousa05/Xavva)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Xavva is a high-performance CLI built with **Bun** that transforms the Java/Tomcat development experience. It brings modern development workflows (like Node.js/Vite) to the Java Enterprise ecosystem with hot-reload, smart logging, and automated deployment.

---

## ✨ Features

- ⚡ **Hot Reload** — Incremental compilation and class injection without server restart
- 📊 **Interactive Dashboard** — Real-time TUI with system metrics and shortcuts
- 🧠 **Smart Log Analyzer** — Stack trace folding and root cause highlighting
- 🔒 **Security Audit** — Automated vulnerability scanning via OSV.dev
- 📦 **Dependency Analysis** — Detect conflicts and outdated dependencies
- 🎯 **Maven & Gradle** — Native support for both build tools
- 🔧 **Auto-Healing** — Automatic diagnosis and repair of common issues
- 🐱 **Embedded Tomcat** — Auto-install Tomcat, no manual setup needed
- 📦 **WAR Generation** — Build as .war file or exploded directory
- 🔤 **Encoding Converter** — Convert file encodings (UTF-8, Windows-1252, ISO-8859-1) and fix mojibake
- 🧙 **Interactive Wizard** — `xavva init` for easy project setup
- 🔔 **Desktop Notifications** — Get notified when builds/deploys complete
- 📜 **Command History** — Track and replay commands with `xavva history` and `xavva redo`
- 🏥 **Health Check** — Verify environment (Java, ports, memory, disk) with `xavva health`
- 🔮 **Shell Completions** — Auto-complete for bash, zsh, and fish
- 🧪 **Test Runner** — Run JUnit/TestNG tests with watch mode and coverage
- 🗄️ **Database Migrations** — Flyway/Liquibase integration
- 🌐 **HTTP Client** — Test APIs without leaving the terminal
- 🐳 **Docker Integration** — Generate configs, build and run containers
- 🌍 **Multi-Environment** — Dev, test, staging configurations

---

## 📦 Installation

```bash
# Via NPM
npm install -g @archznn/xavva

# Or run directly with Bun
bunx @archznn/xavva dev
```

---

## 🚀 Quick Start

```bash
# Initialize project configuration (interactive wizard)
xavva init

# Start development mode with dashboard
xavva dev --tui

# Deploy to Tomcat
xavva deploy

# Build and deploy as .war file
xavva deploy --war

# Analyze dependencies for issues
xavva deps

# Update safe dependencies (non-breaking)
xavva deps --update-safe

# Check for security vulnerabilities
xavva audit

# Convert file encoding (UTF-8 → Windows-1252)
xavva encoding convert --to cp1252 --backup src/main/java/

# Use embedded Tomcat (auto-install)
xavva dev --yes

# Check environment health
xavva health

# View command history
xavva history

# Repeat last command
xavva redo

# Run tests
xavva test
xavva test --watch
xavva test --coverage

# Database migrations
xavva db status
xavva db migrate
xavva db reset --force

# HTTP API testing
xavva http GET /api/users
xavva http POST /api/users --body '{"name":"John"}'

# Docker integration
xavva docker init
xavva docker build
xavva docker up

# Multi-environment
xavva deploy --env staging
xavva dev --env dev

# Enable shell completions (bash example)
eval "$(xavva completion bash)"
```

---

## 📖 Commands

### Core Development

| Command        | Description                                            |
| -------------- | ------------------------------------------------------ |
| `xavva dev`    | Full development mode (build + deploy + watch + debug) |
| `xavva deploy` | Build and deploy application to Tomcat                 |
| `xavva build`  | Compile project only                                   |
| `xavva start`  | Start Tomcat server only                               |

### Code Execution

| Command               | Description                                   |
| --------------------- | --------------------------------------------- |
| `xavva run <class>`   | Execute a Java class with automatic classpath |
| `xavva debug <class>` | Debug a Java class (port 5005)                |

### Analysis & Monitoring

| Command          | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `xavva logs`     | Stream and analyze Tomcat logs in real-time               |
| `xavva deps`     | **Analyze dependencies** — detect conflicts, find updates |
| `xavva audit`    | Security audit of JAR files via OSV.dev                   |
| `xavva doctor`   | Diagnose environment issues (JAVA_HOME, DCEVM)            |
| `xavva profiles` | List available Maven/Gradle profiles                      |
| `xavva docs`     | Generate endpoint documentation                           |
| `xavva tomcat`   | Manage embedded Tomcat installations                      |
| `xavva encoding` | Convert file encodings (UTF-8, CP1252, ISO-8859-1)        |
| `xavva health`   | Check environment health (Java, ports, memory, disk)      |

### Project Management

| Command                 | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `xavva init`            | Initialize project configuration (wizard)      |
| `xavva config`          | View current configuration                     |
| `xavva config --interactive` | Edit configuration interactively         |
| `xavva history`         | Show command history                           |
| `xavva history --clear` | Clear command history                          |
| `xavva redo`            | Repeat the last executed command               |
| `xavva completion <shell>` | Generate shell completions (bash/zsh/fish)  |

### Testing & Database

| Command | Description |
|---------|-------------|
| `xavva test` | Run all tests (JUnit/TestNG) |
| `xavva test --watch` | Run tests in watch mode |
| `xavva test --coverage` | Generate coverage report |
| `xavva test <filter>` | Run specific test class |
| `xavva db status` | Show migration status |
| `xavva db migrate` | Run pending migrations |
| `xavva db reset --force` | Reset database (⚠️ destructive) |
| `xavva db seed` | Populate with test data |

### HTTP Client

| Command | Description |
|---------|-------------|
| `xavva http GET <path>` | Send GET request |
| `xavva http POST <path> --body '{}'` | Send POST request |
| `xavva http <path> --param key=value` | Add query parameters |
| `xavva http <path> --header "Auth: token"` | Add custom headers |

### Docker

| Command | Description |
|---------|-------------|
| `xavva docker init` | Generate Dockerfile & docker-compose.yml |
| `xavva docker build` | Build Docker image |
| `xavva docker up` | Start with docker-compose |
| `xavva docker down` | Stop containers |
| `xavva docker run` | Run development container |
| `xavva docker status` | Show container status |

### Multi-Environment

| Command | Description |
|---------|-------------|
| `xavva deploy --env <name>` | Deploy to specific environment |
| `xavva dev --env <name>` | Use environment configuration |

Configure environments in `xavva.json`:
```json
{
  "environments": {
    "dev": { "port": 8080, "profile": "dev" },
    "staging": { "port": 8081, "profile": "staging" }
  }
}
```

---

## 🐱 Embedded Tomcat

Xavva can automatically download and manage a Tomcat installation for you:

```bash
# First time usage - auto-install Tomcat
xavva dev --yes

# List available versions to download
xavva tomcat list

# List already installed versions
xavva tomcat installed

# Install a specific version
xavva tomcat install 9.0.115

# Switch to a version for this project
xavva tomcat use 9.0.115

# Check Tomcat status
xavva tomcat status

# Remove a version
xavva tomcat uninstall 9.0.115

# Or use with flags
xavva dev --tomcat-version 9.0.115
```

---

## 🔤 File Encoding

The `xavva encoding` command helps you convert file encodings and fix mojibake (corrupted characters):

```bash
# Detect encoding of a file
xavva encoding detect src/main/java/MyClass.java

# Convert from UTF-8 to Windows-1252 (with backup)
xavva encoding convert --from utf-8 --to cp1252 --backup src/main/java/

# Convert a single file
xavva encoding convert --to cp1252 --backup src/main/java/MyClass.java

# Fix mojibake (e.g., "A��o" → "Ação")
xavva encoding fix src/main/java/MyClass.java

# List encodings of all files in src/
xavva encoding list

# Simulate conversion without modifying files
xavva encoding convert --from utf-8 --to cp1252 --dry-run src/
```

### Supported Encodings

- **utf-8** / **utf8** — UTF-8 (default)
- **windows-1252** / **cp1252** — Windows CP1252 (ANSI)
- **iso-8859-1** / **latin1** — ISO-8859-1 (Latin-1)

### Configuration

Set default encoding in `xavva.json`:

```json
{
  "project": {
    "encoding": "cp1252"
  }
}
```

Then use without `--to`:

```bash
xavva encoding convert --backup src/main/java/
```

---

## 🔍 Dependency Analysis

The `xavva deps` command provides comprehensive dependency analysis:

```bash
# Basic analysis
xavva deps

# With verbose output for debugging
xavva deps --verbose

# Update safe dependencies only (non-breaking)
xavva deps --update-safe

# Show fix suggestions for conflicts
xavva deps --fix

# Export report as JSON
xavva deps --output report.json

# Fail on critical conflicts (useful in CI/CD)
xavva deps --strict
```

### What it detects:

- ⚠️ **Version Conflicts** — Same dependency with different versions
- ⬆️ **Available Updates** — Newer versions in Maven Central
- 🔴 **Major Updates** — Breaking changes that need attention
- 📊 **Statistics** — Direct vs transitive dependencies

### Sample output:

```
══════════════════════════════════════════════════════════
📊 DEPENDENCY ANALYSIS
══════════════════════════════════════════════════════════

Statistics:
  Total: 183 dependencies
  Direct: 45 | Transitivas: 138

⚠️  VERSION CONFLICTS (2)
  ✖ com.fasterxml.jackson.core:jackson-databind
     Versions: 2.13.0, 2.12.6

⬆️  UPDATES AVAILABLE (5)
  ↑ org.postgresql:postgresql
     42.2.5 → 42.7.1

⚠️  MAJOR UPDATES (1)
  ! org.springframework.boot:spring-boot-starter
     2.5.0 → 3.1.0
```

---

## ⚙️ Configuration

Create `xavva.json` in your project root:

```json
{
  "project": {
    "appName": "my-application",
    "buildTool": "maven",
    "profile": "dev",
    "tui": false
  },
  "tomcat": {
    "path": "/home/user/apache-tomcat",
    "port": 8080
  }
}
```

> **Note:** On Windows use `"path": "C:/apache-tomcat"` format.

### CLI Options

| Option                 | Description                     |
| ---------------------- | ------------------------------- |
| `-p, --path <path>`    | Tomcat installation path        |
| `-t, --tool <tool>`    | Build tool: `maven` or `gradle` |
| `-n, --name <name>`    | Application name (WAR context)  |
| `--port <port>`        | Tomcat port (default: 8080)     |
| `-P, --profile <prof>` | Maven/Gradle profile            |
| `-e, --encoding <enc>` | Source encoding (utf8, cp1252)  |
| `-w, --watch`          | Enable file watching            |
| `--tui`                | Interactive dashboard mode      |
| `-d, --debug`          | Enable JPDA debugger            |
| `-c, --clean`          | Clean logs before start         |
| `-s, --no-build`       | Skip initial build              |
| `-W, --war`            | Generate .war file (vs exploded)|
| `--cache`              | Use build cache (faster)        |
| `-y, --yes`            | Auto-install Tomcat (no prompt) |
| `-V, --verbose`        | Detailed output                 |
| `-i, --interactive`    | Interactive mode (for config)   |

---

## 🧙 Interactive Wizard

Initialize a new project with the interactive setup wizard:

```bash
xavva init
```

The wizard will guide you through:
- Build tool selection (auto-detected from pom.xml or build.gradle)
- Application name
- Profile selection (detects profiles from your build file)
- Tomcat port configuration
- Embedded Tomcat settings
- Build cache and TUI preferences

---

## 🏥 Health Check

Verify your development environment:

```bash
# Check all components
xavva health

# Checks include:
# - Java version (JDK 11+ recommended)
# - Maven/Gradle availability
# - Tomcat configuration
# - Port availability
# - Memory and disk space
```

---

## 📜 Command History

Track and replay your commands:

```bash
# Show recent commands
xavva history

# Show more entries
xavva history --limit 20

# Clear history
xavva history --clear

# Repeat last command
xavva redo
```

---

## 🔮 Shell Completions

Enable tab completion for your shell:

```bash
# Bash (add to ~/.bashrc)
eval "$(xavva completion bash)"

# Zsh (add to ~/.zshrc)
eval "$(xavva completion zsh)"

# Fish
xavva completion fish > ~/.config/fish/completions/xavva.fish
```

Supported shells: `bash`, `zsh`, `fish`

---

## 💻 Platform Support

Xavva works on all major platforms:

| Platform | Status | Notes |
|----------|--------|-------|
| Windows  | ✅ Full | PowerShell for system integration |
| Linux    | ✅ Full | Bash/Zsh auto-configuration |
| macOS    | ✅ Full | Native terminal support |

### Requirements

- **Bun** runtime (latest version)
- **Java** 11 or higher (JDK)
- **Maven** 3.6+ or **Gradle** 7+
- **Git** (optional, for version info)

---

## 🏗️ Architecture

Xavva uses a modular service-oriented architecture:

- **DashboardService** — TUI management and interactivity
- **LogAnalyzer** — Intelligent log processing
- **DependencyAnalyzerService** — Dependency conflict detection
- **ProjectService** — Project structure discovery
- **BuildService** — Maven/Gradle integration
- **TomcatService** — Server lifecycle management

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ for Java developers who miss modern tooling</sub>
</p>
