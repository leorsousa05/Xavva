# Xavva Examples

This directory contains sample projects demonstrating Xavva CLI capabilities.

## Available Samples

### 📦 maven-sample

A Maven-based web application with Jakarta EE 10 Servlets.

**Features:**
- Jakarta EE 10 (Servlet 6.0)
- Maven profiles (dev/prod)
- Hot-reload demonstration
- Embedded Tomcat

**Quick Start:**
```bash
cd maven-sample
xavva init
xavva dev --watch
```

**Files:**
- `pom.xml` - Maven configuration with profiles
- `src/main/java/com/example/HelloServlet.java` - Sample servlet
- `src/main/webapp/` - Web resources

---

### ⚡ gradle-sample

A Gradle-based REST API application with JAX-RS.

**Features:**
- Jakarta EE 10 (JAX-RS 3.1)
- Jersey implementation
- REST API endpoints
- JSON processing
- Hot-reload demonstration

**Quick Start:**
```bash
cd gradle-sample
xavva init
xavva dev --watch
```

**Files:**
- `build.gradle` - Gradle configuration
- `src/main/java/com/example/ApiResource.java` - REST endpoints
- `src/main/java/com/example/JerseyConfig.java` - Jersey config

---

## Common Commands

Both samples support the same Xavva commands:

```bash
# Initialize configuration
xavva init

# Development mode with hot-reload
xavva dev --watch

# Development with TUI dashboard
xavva dev --tui --watch

# Build only
xavva build

# Deploy to Tomcat
xavva deploy

# View logs
xavva logs

# Check environment
xavva health

# Generate changelog
xavva changelog generate
```

## Hot Reload Demonstration

All samples are configured to demonstrate Xavva's hot-reload capabilities:

1. Start the development server:
   ```bash
   xavva dev --watch
   ```

2. Open the application URL in your browser:
   - Maven: http://localhost:8080/maven-xavva-sample/
   - Gradle: http://localhost:8080/gradle-xavva-sample/

3. Edit the source code (e.g., change a message in the servlet/resource)

4. Save the file

5. Watch the changes appear instantly without server restart! ⚡

## Learning Path

1. **Start with maven-sample** if you're new to Xavva
   - Simpler structure (just a servlet)
   - Traditional Maven layout

2. **Try gradle-sample** for REST API development
   - Modern JAX-RS approach
   - JSON API endpoints
   - More complex build configuration

3. **Experiment with Xavva features:**
   - Try `--debug` flag for debugging
   - Use `--tui` for the dashboard
   - Test `xavva health` to check environment
   - Generate a changelog with `xavva changelog`
