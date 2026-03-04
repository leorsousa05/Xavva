# XAVVA CLI 🚀

> Ultra-fast development toolkit for Java Enterprise (Tomcat) on Windows

[![Version](https://img.shields.io/badge/version-2.4.0-blue.svg)](https://github.com/leorsousa05/Xavva)
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

---

## 📦 Installation

```powershell
# Via NPM
npm install -g @archznn/xavva

# Or run directly with Bun
bunx @archznn/xavva dev
```

---

## 🚀 Quick Start

```bash
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

# Use embedded Tomcat (auto-install)
xavva dev --yes
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
    "path": "C:/apache-tomcat",
    "port": 8080
  }
}
```

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
