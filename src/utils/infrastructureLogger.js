const InfrastructureLog = require("../models/infrastructureLog.model");

// ANSI color escape codes for terminal coloring
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m"
};

const LEVEL_COLORS = {
    INFO: colors.cyan,
    SUCCESS: colors.green,
    WARNING: colors.yellow,
    ERROR: colors.red,
    CRITICAL: `${colors.bright}${colors.bgRed}${colors.white}`
};

const TYPE_SYMBOLS = {
    EMAIL: "✉️",
    AUTH: "🔐",
    SOCKET: "🔌",
    REDIS: "🧠",
    SERVER: "🚀",
    SECURITY: "🛡️",
    DATABASE: "🗄️",
    RATE_LIMIT: "⏳",
    SYSTEM: "⚙️"
};

let ioInstance = null;

class InfrastructureLogger {
    /**
     * Store a reference to the global Socket.IO instance for real-time log streaming.
     */
    static setSocketIO(io) {
        ioInstance = io;
    }

    /**
     * Centralized logging function.
     * Writes to console, asynchronously persists to DB, and streams to connected admins in real time.
     */
    static log({ type, level, service, message, metadata = {}, userId = null, requestId = null, status = null }) {
        const timestamp = new Date();
        
        // 1. Console Output (Clean, structured, and colored)
        const symbol = TYPE_SYMBOLS[type] || "🔹";
        const levelColor = LEVEL_COLORS[level] || colors.white;
        const coloredMessage = `[${timestamp.toISOString()}] ${symbol} [${type}][${level}] (${service}) ${message}`;
        
        if (level === "ERROR" || level === "CRITICAL") {
            console.error(`${levelColor}${coloredMessage}${colors.reset}`);
        } else {
            console.log(`${levelColor}${coloredMessage}${colors.reset}`);
        }

        // 2. Async non-blocking DB persistence
        setImmediate(async () => {
            try {
                const logEntry = new InfrastructureLog({
                    type,
                    level,
                    service,
                    message,
                    metadata,
                    timestamp,
                    status,
                    userId,
                    requestId
                });
                
                const persistedLog = await logEntry.save();
                
                // 3. Socket.IO Real-time Stream to Admin panel
                if (ioInstance) {
                    ioInstance.to("admin:monitoring").emit("infrastructure-log", persistedLog);
                }
            } catch (err) {
                console.error(`❌ [Logger System] Failed to persist infrastructure log to database:`, err.message);
            }
        });
    }

    static info(service, message, metadata = {}, userId = null, requestId = null, status = null) {
        return this.log({ type: "SYSTEM", level: "INFO", service, message, metadata, userId, requestId, status });
    }

    static success(service, message, metadata = {}, userId = null, requestId = null, status = null) {
        return this.log({ type: "SYSTEM", level: "SUCCESS", service, message, metadata, userId, requestId, status });
    }

    static warning(service, message, metadata = {}, userId = null, requestId = null, status = null) {
        return this.log({ type: "SYSTEM", level: "WARNING", service, message, metadata, userId, requestId, status });
    }

    static error(service, message, metadata = {}, userId = null, requestId = null, status = null) {
        return this.log({ type: "SYSTEM", level: "ERROR", service, message, metadata, userId, requestId, status });
    }

    static critical(service, message, metadata = {}, userId = null, requestId = null, status = null) {
        return this.log({ type: "SYSTEM", level: "CRITICAL", service, message, metadata, userId, requestId, status });
    }

    // Specific category helper builders to make it extremely easy to use across services
    static email(level, message, metadata = {}, status = null) {
        return this.log({ type: "EMAIL", level, service: "email-service", message, metadata, status });
    }

    static auth(level, message, metadata = {}, userId = null, requestId = null) {
        return this.log({ type: "AUTH", level, service: "auth-controller", message, metadata, userId, requestId });
    }

    static socket(level, message, metadata = {}) {
        return this.log({ type: "SOCKET", level, service: "socket-server", message, metadata });
    }

    static redis(level, message, metadata = {}) {
        return this.log({ type: "REDIS", level, service: "redis-client", message, metadata });
    }

    static server(level, message, metadata = {}) {
        return this.log({ type: "SERVER", level, service: "api-server", message, metadata });
    }

    static security(level, message, metadata = {}, userId = null, requestId = null) {
        return this.log({ type: "SECURITY", level, service: "security-gate", message, metadata, userId, requestId });
    }

    static database(level, message, metadata = {}) {
        return this.log({ type: "DATABASE", level, service: "database-client", message, metadata });
    }

    static rateLimit(level, message, metadata = {}, userId = null, requestId = null) {
        return this.log({ type: "RATE_LIMIT", level, service: "rate-limiter", message, metadata, userId, requestId });
    }
}

module.exports = InfrastructureLogger;
