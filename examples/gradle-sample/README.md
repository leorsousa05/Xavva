# Xavva Gradle Sample

A sample Gradle project demonstrating Xavva CLI capabilities with JAX-RS REST API.

## Prerequisites

- Java 17+
- Gradle 7+
- Bun (for Xavva)

## Quick Start

```bash
# Navigate to this directory
cd examples/gradle-sample

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

# Generate changelog
xavva changelog generate
```

## API Endpoints

Once the server is running, test these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hello` | Simple greeting |
| GET | `/api/time` | Current server time |
| GET | `/api/info` | Server information |
| POST | `/api/echo` | Echo request body |

### Example Requests

```bash
# Get greeting
curl http://localhost:8080/gradle-xavva-sample/api/hello

# Get server time
curl http://localhost:8080/gradle-xavva-sample/api/time

# Get server info
curl http://localhost:8080/gradle-xavva-sample/api/info

# Echo request
curl -X POST http://localhost:8080/gradle-xavva-sample/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Xavva!"}'
```

## Project Structure

```
gradle-sample/
├── build.gradle            # Gradle configuration
├── settings.gradle         # Project settings
├── xavva.json             # Xavva configuration
├── src/
│   └── main/
│       ├── java/com/example/
│       │   ├── ApiResource.java     # JAX-RS REST endpoints
│       │   └── JerseyConfig.java    # Jersey configuration
│       └── webapp/
│           ├── WEB-INF/
│           │   └── web.xml
│           └── index.html           # Welcome page with API docs
```

## Features Demonstrated

- ✅ Jakarta EE 10 (JAX-RS 3.1)
- ✅ Jersey 3.1 implementation
- ✅ Hot-reload with `xavva dev --watch`
- ✅ Profile-based builds (dev/prod via -Pprofile)
- ✅ Embedded Tomcat
- ✅ TUI Dashboard
- ✅ JSON REST API

## Hot Reload Test

1. Start the server: `xavva dev --watch`
2. Open http://localhost:8080/gradle-xavva-sample/api/hello
3. Edit `ApiResource.java` (change the greeting message)
4. Save the file
5. See changes instantly! ⚡

## Gradle-Specific Features

### Build with Profile

```bash
# Development build (with debug info)
gradle build -Pprofile=dev

# Production build (optimized)
gradle build -Pprofile=prod
```

### Using Gretty Plugin

```bash
# Run with Gretty (alternative to Xavva)
gradle appRun

# Run in debug mode
gradle appRunDebug
```
