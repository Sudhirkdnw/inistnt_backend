const dotenv = require('dotenv');
const path = require('path');

// Load environment variables dynamically based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/db/db');
const http = require('http');
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { redisClient, redisSubscriber, redisReady } = require('./src/utils/redis');

connectDB();

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Global Error Handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    const errMsg = reason?.message || String(reason || '');
    if (errMsg.includes('Connection is closed') || errMsg.includes('ECONNRESET') || errMsg.includes('read ECONNRESET')) {
        console.log('ℹ️ [Transient] Redis connection cycled, reconnecting automatically...');
        return;
    }
    console.error('🔥 UNHANDLED REJECTION:', reason);
});

const ALLOWED_ORIGINS = [
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : []),
    'https://hykee.in',
    'https://www.hykee.in',
    'https://admin.hykee.in'
].filter(Boolean).map(o => o.trim());

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (process.env.NODE_ENV !== 'production') {
                const isLocal = origin.startsWith('http://localhost') ||
                    origin.startsWith('http://127.0.0.1') ||
                    origin.startsWith('http://192.168.') ||
                    origin.startsWith('http://10.') ||
                    origin.startsWith('http://172.') ||
                    origin.startsWith('exp://');
                if (isLocal) return callback(null, true);
            }
            const isAllowed = ALLOWED_ORIGINS.some(allowed => 
                origin === allowed || 
                origin.startsWith(allowed)
            ) || origin.endsWith('.vercel.app');

            if (isAllowed) {
                return callback(null, true);
            }
            return callback(null, true);
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.set("io", io);

const InfrastructureLogger = require('./src/utils/infrastructureLogger');
InfrastructureLogger.setSocketIO(io);

// In-memory fallback for online users (used if Redis is disabled)
const memoryOnlineUsers = new Set();


io.on("connection", (socket) => {
    InfrastructureLogger.socket("INFO", `Client connected to Socket.IO. Socket ID: ${socket.id}`);

    socket.on("join-monitoring", (passedToken) => {
        try {
            const jwt = require("jsonwebtoken");
            const userModel = require("./src/models/user.model");
            
            // Multi-channel fallback: parameter, handshake cookies, handshake auth, or query
            let token = passedToken;
            if (!token && socket.handshake.headers.cookie) {
                const cookies = socket.handshake.headers.cookie.split(';').reduce((acc, c) => {
                    const [key, ...val] = c.trim().split('=');
                    if (key) acc[key] = val.join('=');
                    return acc;
                }, {});
                token = cookies.token;
            }
            if (!token) {
                token = socket.handshake.auth?.token || socket.handshake.query?.token;
            }

            if (!token) {
                return socket.emit("monitoring-status", { status: "failed", message: "Access Denied: Authentication token required." });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userModel.findById(decoded.id).then(user => {
                if (user && user.role === "admin") {
                    socket.join("admin:monitoring");
                    socket.emit("monitoring-status", { status: "connected", message: "Subscribed to real-time infrastructure logs." });
                    InfrastructureLogger.socket("SUCCESS", `Admin user "${user.username}" (ID: ${user._id}) joined real-time monitoring channel.`, {
                        socketId: socket.id
                    });
                } else {
                    socket.emit("monitoring-status", { status: "failed", message: "Unauthorized: Admin access required." });
                    InfrastructureLogger.security("WARNING", `Unauthorized attempt to join monitoring room from Socket ID: ${socket.id}`, {
                        userId: user ? user._id : null,
                        username: user ? user.username : "unknown"
                    });
                }
            });
        } catch (err) {
            socket.emit("monitoring-status", { status: "failed", message: "Invalid authentication token." });
            InfrastructureLogger.security("WARNING", `Failed validation for monitoring subscription on Socket ID: ${socket.id}. Error: ${err.message}`);
        }
    });

    socket.on("setup", async (userId) => {
        const uid = String(userId);
        
        try {
            const MAX_CONNECTIONS_PER_USER = parseInt(process.env.MAX_CONNECTIONS_PER_USER) || 3;
            
            if (redisClient && redisClient.status === 'ready') {
                // Use Redis INCR counter for connection limits
                const connKey = `socket_conns:${uid}`;
                const count = await redisClient.incr(connKey);
                await redisClient.expire(connKey, 86400);

                if (count > MAX_CONNECTIONS_PER_USER) {
                    await redisClient.decr(connKey).catch(() => {});
                    socket.emit('forced_disconnect', { reason: 'Too many concurrent connections.' });
                    socket.disconnect(true);
                    return;
                }

                // --- ONLINE STATUS TRACKING (REDIS) ---
                await redisClient.sadd("online_users", uid).catch(() => {});
                const currentOnline = await redisClient.smembers("online_users").catch(() => []);
                io.emit('online-users', currentOnline); // Broadcast to all
                socket.emit('online-users', currentOnline); // Instant direct reply to current user
                socket.broadcast.emit('user-online', uid);

                // Decrement counter on disconnect
                socket.once('disconnect', async () => {
                    try { 
                        if (redisClient && redisClient.status === 'ready') {
                            await redisClient.decr(connKey).catch(() => {}); 
                        }
                        
                        // online status srem: wait a bit to allow fast reconnects
                        setTimeout(async () => {
                            try {
                                const sockets = await io.in(uid).fetchSockets();
                                if (sockets.length === 0 && redisClient && redisClient.status === 'ready') {
                                    await redisClient.srem("online_users", uid).catch(() => {});
                                    const updatedOnline = await redisClient.smembers("online_users").catch(() => []);
                                    io.emit("online-users", updatedOnline); // Broadcast to all
                                    io.emit("user-offline", uid);
                                }
                            } catch (_) {}
                        }, 2000);
                    } catch (_) {}
                });
            } else {
                // --- ONLINE STATUS TRACKING (IN-MEMORY FALLBACK) ---
                memoryOnlineUsers.add(uid);
                const memOnline = Array.from(memoryOnlineUsers);
                io.emit('online-users', memOnline);
                socket.emit('online-users', memOnline);
                socket.broadcast.emit('user-online', uid);

                socket.once('disconnect', async () => {
                    setTimeout(async () => {
                        try {
                            const sockets = await io.in(uid).fetchSockets();
                            if (sockets.length === 0) {
                                memoryOnlineUsers.delete(uid);
                                const updatedMemOnline = Array.from(memoryOnlineUsers);
                                io.emit("online-users", updatedMemOnline);
                                io.emit("user-offline", uid);
                            }
                        } catch (_) {}
                    }, 2000);
                });
            }
        } catch (err) {
            if (!err.message?.includes('Connection is closed')) {
                console.warn('Socket connection limit fallback to memory:', err.message);
            }
            memoryOnlineUsers.add(uid);
            const memOnline = Array.from(memoryOnlineUsers);
            io.emit('online-users', memOnline);
            socket.emit('online-users', memOnline);
            socket.broadcast.emit('user-online', uid);
        }

        socket.join(uid);
        socket.userId = uid;
    });

    socket.on("get-online-users", async () => {
        try {
            if (redisClient && redisClient.status === 'ready') {
                const online = await redisClient.smembers("online_users").catch(() => []);
                socket.emit("online-users", online);
            } else {
                socket.emit("online-users", Array.from(memoryOnlineUsers));
            }
        } catch (e) {
            socket.emit("online-users", Array.from(memoryOnlineUsers));
        }
    });

    const { 
        setUserActiveConversation, 
        removeUserActiveConversation, 
        cleanupSocketPresence 
    } = require('./src/utils/presence');

    const handleJoinConversation = async (payload) => {
        const conversationId = typeof payload === 'object' ? payload.conversationId : payload;
        const targetUserId = (typeof payload === 'object' && payload.userId) ? String(payload.userId) : socket.userId;
        if (!conversationId) return;

        const cidStr = String(conversationId);
        socket.join(cidStr);

        if (targetUserId) {
            socket.userId = String(targetUserId);
            await setUserActiveConversation(targetUserId, socket.id, cidStr);

            // Mark unread messages in this conversation as read
            try {
                const MessageModel = require('./src/models/message.model');
                const updateRes = await MessageModel.updateMany(
                    { conversation: cidStr, sender: { $ne: targetUserId }, readBy: { $ne: targetUserId } },
                    { $addToSet: { readBy: targetUserId } }
                );

                if (updateRes.modifiedCount > 0) {
                    io.to(cidStr).emit("messages-read", { 
                        conversationId: cidStr, 
                        readBy: targetUserId 
                    });
                }
            } catch (err) {
                // Ignore read update errors
            }
        }

        try {
            const conv = await require('./src/models/conversation.model').findById(cidStr).select('isAnonymousChat anonymousIdentities');
            if (conv && conv.isAnonymousChat && redisClient && redisClient.status === 'ready') {
                const identitiesObj = {};
                if (conv.anonymousIdentities && typeof conv.anonymousIdentities.forEach === 'function') {
                    conv.anonymousIdentities.forEach((val, key) => identitiesObj[key] = val);
                } else if (conv.anonymousIdentities) {
                    Object.assign(identitiesObj, conv.anonymousIdentities);
                }
                await redisClient.set(`anonymous_room:${cidStr}`, JSON.stringify(identitiesObj), 'EX', 3600).catch(() => {});
            }
        } catch (e) {
            // Ignore background caching errors
        }
    };

    const handleLeaveConversation = async (payload) => {
        const conversationId = typeof payload === 'object' ? payload.conversationId : payload;
        const targetUserId = (typeof payload === 'object' && payload.userId) ? String(payload.userId) : socket.userId;
        if (!conversationId) return;

        const cidStr = String(conversationId);
        socket.leave(cidStr);

        if (targetUserId) {
            await removeUserActiveConversation(targetUserId, socket.id, cidStr);
        }
    };

    socket.on("join-conversation", handleJoinConversation);
    socket.on("conversation:active", handleJoinConversation);

    socket.on("leave-conversation", handleLeaveConversation);
    socket.on("conversation:inactive", handleLeaveConversation);

    socket.on("typing", async ({ conversationId, username }) => {
        let emitUsername = username;
        if (redisClient && redisClient.status === 'ready') {
            const identitiesStr = await redisClient.get(`anonymous_room:${conversationId}`).catch(() => null);
            if (identitiesStr) {
                try {
                    const identities = JSON.parse(identitiesStr);
                    emitUsername = identities[socket.userId] || "Anonymous User";
                } catch (e) {
                    emitUsername = "Anonymous User";
                }
            }
        }
        socket.to(conversationId).emit("user-typing", { conversationId, username: emitUsername });
    });

    socket.on("stop-typing", async ({ conversationId, username }) => {
        let emitUsername = username;
        if (redisClient && redisClient.status === 'ready') {
            const identitiesStr = await redisClient.get(`anonymous_room:${conversationId}`).catch(() => null);
            if (identitiesStr) {
                try {
                    const identities = JSON.parse(identitiesStr);
                    emitUsername = identities[socket.userId] || "Anonymous User";
                } catch (e) {
                    emitUsername = "Anonymous User";
                }
            }
        }
        socket.to(conversationId).emit("user-stopped-typing", { conversationId, username: emitUsername });
    });

    socket.on("disconnect", () => {
        cleanupSocketPresence(socket.id, socket.userId);
    });
});

// ── Graceful Shutdown ──────────────────────────────────────────
const gracefulShutdown = async (signal) => {
    InfrastructureLogger.server("WARNING", `${signal} signal received. Initiating graceful server shutdown process...`);

    // Stop accepting new socket connections
    io.close();

    // Stop email system background queues
    try {
        const { shutdownEmailSystem } = require('./src/services/emailService');
        shutdownEmailSystem();
        InfrastructureLogger.email("INFO", "Email queue background worker stopped successfully.");
    } catch (err) {
        InfrastructureLogger.email("ERROR", `Failed to stop email queue worker: ${err.message}`);
    }

    // Close server to stop new HTTP requests
    server.close(async () => {
        InfrastructureLogger.server("INFO", "HTTP API gateway successfully closed.");

        try {
            // Close MongoDB connection
            await mongoose.connection.close();
            InfrastructureLogger.database("INFO", "MongoDB connection terminated cleanly.");

            // Close Redis connections
            if (redisClient) {
                await redisClient.quit();
                await redisSubscriber.quit();
                InfrastructureLogger.redis("INFO", "Redis cache and pub/sub channels terminated cleanly.");
            }

            InfrastructureLogger.server("SUCCESS", "Graceful shutdown complete. Process exiting.");
            process.exit(0);
        } catch (err) {
            InfrastructureLogger.server("CRITICAL", `Error occurred during graceful shutdown sequence: ${err.message}`, { error: err.stack });
            process.exit(1);
        }
    });

    // If shutdown takes too long, force exit
    setTimeout(() => {
        InfrastructureLogger.server("CRITICAL", "Shutdown sequence timed out. Forcing hard termination.");
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const { loadSettings } = require('./src/utils/settings');
const { initCronJobs } = require('./src/service/cron.service');
const { initEmailSystem } = require('./src/services/emailService');

const startServer = async () => {
    try {
        await loadSettings();
        InfrastructureLogger.server("SUCCESS", "System settings successfully synchronized and loaded into memory.");
    } catch (err) {
        InfrastructureLogger.server("CRITICAL", `Failed to synchronize system settings: ${err.message}`);
    }

    try {
        initCronJobs();
        InfrastructureLogger.server("INFO", "System cron jobs initialized successfully.");
    } catch (err) {
        InfrastructureLogger.server("ERROR", `Failed to initialize system cron jobs: ${err.message}`);
    }
    
    // Initialize push-only email infrastructure
    try {
        await initEmailSystem();
        InfrastructureLogger.email("SUCCESS", `Asynchronous email push infrastructure initialized.`);
    } catch (err) {
        InfrastructureLogger.email("CRITICAL", `Asynchronous email worker infrastructure failed to initialize: ${err.message}`);
        process.exit(1);
    }

    if (redisClient && redisSubscriber) {
        try {
            await redisReady;
            io.adapter(createAdapter(redisClient, redisSubscriber));
            InfrastructureLogger.redis("SUCCESS", "Socket.IO using Redis adapter (cluster-ready).");
        } catch (err) {
            InfrastructureLogger.redis("WARNING", `Redis adapter initialization failed. Falling back to memory-only: ${err.message}`);
        }
    }

    // Start automated background subscription and photo purge worker
    const { startSubscriptionCleanupWorker } = require("./src/services/subscriptionCleanup.service");
    startSubscriptionCleanupWorker();

    server.listen(PORT, () => {
        InfrastructureLogger.server("SUCCESS", `Hykee Enterprise Node Server is listening on port ${PORT} (Enterprise Cluster Mode)`);
    });
};

startServer();