/**
 * Constantes da aplicação XAVVA CLI
 * 
 * Centraliza valores mágicos para facilitar manutenção e configuração.
 */

// Ports padrão
export const DEFAULT_TOMCAT_PORT = 8080;
export const DEFAULT_DEBUG_PORT = 5005;

// Timeouts (em milissegundos)
export const TIMEOUT_SHUTDOWN_MS = 5000;
export const WATCHER_DEBOUNCE_MS = 1500;
export const WATCHER_COOLING_MS = 1000;
export const BROWSER_OPEN_DELAY_MS = 800;
export const DEPLOY_HEALTH_CHECK_DELAY_MS = 1500;
export const HOTSWAP_DELAY_MS = 500;
export const TOMCAT_CLEAN_RETRY_DELAY_MS = 50;

// Tamanhos e limites
export const MAX_LOG_SCROLLBUFFER = 1000;
export const MAX_BUILD_ERRORS_SHOWN = 15;
export const MAX_HISTORY_ITEMS = 10;
export const JAR_INTEGRITY_BUFFER_SIZE = 1024;
export const JAR_MIN_VALID_SIZE = 1000;
export const ZIP_EOCD_SIGNATURE_SIZE = 4;

// Dashboard
export const DASHBOARD_REFRESH_INTERVAL_MS = 1000;
export const DASHBOARD_LOG_SLICE_LINES = 1000;

// Build
export const MAVEN_PARALLEL_THREADS = "1C";
export const JVM_MEMORY_OPTS = "-Xms512m -Xmx1024m -XX:+UseParallelGC";
export const GRADLE_MEMORY_OPTS = "-Xmx1024m -Dorg.gradle.daemon=true";

// Exit codes
export const EXIT_SUCCESS = 0;
export const EXIT_GENERIC_ERROR = 1;
export const EXIT_INVALID_COMMAND = 2;
export const EXIT_BUILD_FAILED = 3;
export const EXIT_DEPLOY_FAILED = 4;
export const EXIT_SIGINT = 130;

// File patterns
export const JAVA_FILE_PATTERN = "**/*.java";
export const WAR_EXTENSION = ".war";
export const JAR_EXTENSION = ".jar";

// Directories
export const XAVVA_DIR = ".xavva";
export const TARGET_DIR = "target";
export const BUILD_DIR = "build";
export const WEBAPP_DIR = "webapps";
