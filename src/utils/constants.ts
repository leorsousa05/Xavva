/**
 * Constantes da aplicação XAVVA CLI
 * 
 * ⚠️ NOTA: Este arquivo re-exporta constantes de src/config/versions.ts
 * para manter compatibilidade. Novo código deve importar diretamente
 * de src/config/versions.ts
 * 
 * @deprecated Importe diretamente de src/config/versions.ts
 */

// Re-exportar todas as constantes centralizadas
export {
    VERSIONS,
    PORTS,
    TIMEOUTS,
    LIMITS,
    DASHBOARD,
    BUILD,
    EXIT_CODES,
    PATHS,
    CACHE,
    // Types
    type TomcatVersion,
    // Functions
    getHotswapAgentUrl,
    isSupportedTomcatVersion,
    getAvailableTomcatVersions,
    getTomcatSha512,
} from "../config/versions";

// ============================================
// ALIASES LEGACY (para compatibilidade)
// ============================================

/** @deprecated Use PORTS.DEFAULT_TOMCAT */
export const DEFAULT_TOMCAT_PORT = 8080;

/** @deprecated Use PORTS.DEFAULT_DEBUG */
export const DEFAULT_DEBUG_PORT = 5005;

/** @deprecated Use TIMEOUTS.SHUTDOWN */
export const TIMEOUT_SHUTDOWN_MS = 5000;

/** @deprecated Use TIMEOUTS.WATCHER_DEBOUNCE */
export const WATCHER_DEBOUNCE_MS = 1500;

/** @deprecated Use TIMEOUTS.COOLING */
export const WATCHER_COOLING_MS = 1000;

/** @deprecated Use TIMEOUTS.BROWSER_OPEN */
export const BROWSER_OPEN_DELAY_MS = 800;

/** @deprecated Use TIMEOUTS.DEPLOY_HEALTH_CHECK */
export const DEPLOY_HEALTH_CHECK_DELAY_MS = 1500;

/** @deprecated Use TIMEOUTS.HOTSWAP */
export const HOTSWAP_DELAY_MS = 500;

/** @deprecated Use TIMEOUTS.TOMCAT_CLEAN_RETRY */
export const TOMCAT_CLEAN_RETRY_DELAY_MS = 50;

/** @deprecated Use LIMITS.MAX_LOG_SCROLLBUFFER */
export const MAX_LOG_SCROLLBUFFER = 1000;

/** @deprecated Use LIMITS.MAX_BUILD_ERRORS_SHOWN */
export const MAX_BUILD_ERRORS_SHOWN = 15;

/** @deprecated Use LIMITS.MAX_HISTORY_ITEMS */
export const MAX_HISTORY_ITEMS = 10;

/** @deprecated Use LIMITS.JAR_INTEGRITY_BUFFER_SIZE */
export const JAR_INTEGRITY_BUFFER_SIZE = 1024;

/** @deprecated Use LIMITS.JAR_MIN_VALID_SIZE */
export const JAR_MIN_VALID_SIZE = 1000;

/** @deprecated Use LIMITS.ZIP_EOCD_SIGNATURE_SIZE */
export const ZIP_EOCD_SIGNATURE_SIZE = 4;

/** @deprecated Use DASHBOARD.REFRESH_INTERVAL_MS */
export const DASHBOARD_REFRESH_INTERVAL_MS = 1000;

/** @deprecated Use DASHBOARD.LOG_SLICE_LINES */
export const DASHBOARD_LOG_SLICE_LINES = 1000;

/** @deprecated Use BUILD.MAVEN_PARALLEL_THREADS */
export const MAVEN_PARALLEL_THREADS = "1C";

/** @deprecated Use BUILD.JVM_MEMORY_OPTS */
export const JVM_MEMORY_OPTS = "-Xms512m -Xmx1024m -XX:+UseParallelGC";

/** @deprecated Use BUILD.GRADLE_MEMORY_OPTS */
export const GRADLE_MEMORY_OPTS = "-Xmx1024m -Dorg.gradle.daemon=true";

/** @deprecated Use EXIT_CODES.SUCCESS */
export const EXIT_SUCCESS = 0;

/** @deprecated Use EXIT_CODES.GENERIC_ERROR */
export const EXIT_GENERIC_ERROR = 1;

/** @deprecated Use EXIT_CODES.INVALID_COMMAND */
export const EXIT_INVALID_COMMAND = 2;

/** @deprecated Use EXIT_CODES.BUILD_FAILED */
export const EXIT_BUILD_FAILED = 3;

/** @deprecated Use EXIT_CODES.DEPLOY_FAILED */
export const EXIT_DEPLOY_FAILED = 4;

/** @deprecated Use EXIT_CODES.SIGINT */
export const EXIT_SIGINT = 130;

/** @deprecated Use PATHS.JAVA_FILE_PATTERN */
export const JAVA_FILE_PATTERN = "**/*.java";

/** @deprecated Use PATHS.WAR_EXTENSION */
export const WAR_EXTENSION = ".war";

/** @deprecated Use PATHS.JAR_EXTENSION */
export const JAR_EXTENSION = ".jar";

/** @deprecated Use PATHS.XAVVA_DIR */
export const XAVVA_DIR = ".xavva";

/** @deprecated Use PATHS.TARGET_DIR */
export const TARGET_DIR = "target";

/** @deprecated Use PATHS.BUILD_DIR */
export const BUILD_DIR = "build";

/** @deprecated Use PATHS.WEBAPP_DIR */
export const WEBAPP_DIR = "webapps";
