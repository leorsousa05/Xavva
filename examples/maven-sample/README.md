# Xavva Maven Sample

A sample Maven project demonstrating Xavva CLI capabilities.

## Prerequisites

- Java 17+
- Maven 3.6+
- Bun (for Xavva)

## Quick Start

```bash
# Navigate to this directory
cd examples/maven-sample

# Initialize Xavva configuration
xavva init

# Start development mode with hot-reload
xavva dev --watch

# Or start with TUI dashboard
xavva dev --tui --watch
```

## Available Commands

```bash
# Build the project
xavva build

# Deploy to Tomcat
xavva deploy

# Start Tomcat only
xavva start

# View logs
xavva logs

# Check environment
xavva health
```

## Project Structure

```
maven-sample/
├── pom.xml                  # Maven configuration with dev/prod profiles
├── xavva.json              # Xavva configuration
├── src/
│   └── main/
│       ├── java/com/example/
│       │   └── HelloServlet.java    # Sample servlet
│       └── webapp/
│           ├── WEB-INF/
│           │   └── web.xml
│           └── index.html           # Welcome page
```

## Features Demonstrated

- ✅ Jakarta EE 10 (Servlet 6.0)
- ✅ Hot-reload with `xavva dev --watch`
- ✅ Profile-based builds (dev/prod)
- ✅ Embedded Tomcat
- ✅ TUI Dashboard

## Hot Reload Test

1. Start the server: `xavva dev --watch`
2. Open http://localhost:8080/maven-xavva-sample/hello
3. Edit `HelloServlet.java`
4. Save the file
5. See changes instantly! ⚡
