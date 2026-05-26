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
    console.error('🔥 UNHANDLED REJECTION:', reason);
});

const ALLOWED_ORIGINS = [
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : [])
].filter(Boolean).map(o => o.trim());

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            const isAllowed = ALLOWED_ORIGINS.some(allowed => 
                origin === allowed || 
                origin.startsWith(allowed)
            ) || origin.endsWith('.vercel.app');

            if (isAllowed) {
                return callback(null, true);
            }
            callback(new Error(`CORS: origin ${origin} not allowed`));
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.set("io", io);

const InfrastructureLogger = require('./src/utils/infrastructureLogger');
InfrastructureLogger.setSocketIO(io);

const onlineUsers = new Map();
io._onlineUsers = onlineUsers;

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

    socket.on("setup", (userId) => {
        const uid = String(userId);
        socket.join(uid);
        onlineUsers.set(uid, socket.id);
        socket.userId = uid;
        io.emit("online-users", Array.from(onlineUsers.keys()));
    });

    socket.on("join-conversation", async (conversationId) => {
        socket.join(conversationId);
        try {
            const conv = await require('./src/models/conversation.model').findById(conversationId).select('isAnonymousChat anonymousIdentities');
            if (conv && conv.isAnonymousChat) {
                if (!io._anonymousRooms) io._anonymousRooms = new Map();
                // Store identities Map as object to easily access by string key
                const identitiesObj = {};
                if (conv.anonymousIdentities && typeof conv.anonymousIdentities.forEach === 'function') {
                    conv.anonymousIdentities.forEach((val, key) => identitiesObj[key] = val);
                } else if (conv.anonymousIdentities) {
                    Object.assign(identitiesObj, conv.anonymousIdentities);
                }
                io._anonymousRooms.set(conversationId, identitiesObj);
            }
        } catch (e) {
            console.error("Error caching anonymous identities:", e);
        }
    });

    socket.on("leave-conversation", (conversationId) => {
        socket.leave(conversationId);
    });

    socket.on("typing", ({ conversationId, username }) => {
        let emitUsername = username;
        if (io._anonymousRooms && io._anonymousRooms.has(conversationId)) {
            const identities = io._anonymousRooms.get(conversationId);
            emitUsername = identities[socket.userId] || "Anonymous User";
        }
        socket.to(conversationId).emit("user-typing", { conversationId, username: emitUsername });
    });

    socket.on("stop-typing", ({ conversationId, username }) => {
        let emitUsername = username;
        if (io._anonymousRooms && io._anonymousRooms.has(conversationId)) {
            const identities = io._anonymousRooms.get(conversationId);
            emitUsername = identities[socket.userId] || "Anonymous User";
        }
        socket.to(conversationId).emit("user-stopped-typing", { conversationId, username: emitUsername });
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            onlineUsers.delete(socket.userId);
            io.emit("online-users", Array.from(onlineUsers.keys()));
        }
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

const seedRolesAndSuperadmin = async () => {
    try {
        const roleModel = require("./src/models/role.model");
        const userModel = require("./src/models/user.model");

        const modules = [
            "userManagement",
            "reports",
            "stories",
            "posts",
            "dating",
            "premium",
            "payments",
            "communities",
            "analytics",
            "verificationRequests"
        ];

        const allPermissionsTrue = {};
        modules.forEach(m => {
            allPermissionsTrue[m] = { view: true, create: true, update: true, delete: true };
        });

        let superadminRole = await roleModel.findOne({ name: "superadmin" });
        if (!superadminRole) {
            superadminRole = await roleModel.create({
                name: "superadmin",
                description: "Super Administrator with full platform controls.",
                permissions: allPermissionsTrue
            });
            console.log("🟢 Seeded superadmin role successfully");
        }

        const adminUser = await userModel.findOne({ username: "admin" });
        if (adminUser) {
            if (!adminUser.roleRef || String(adminUser.roleRef) !== String(superadminRole._id)) {
                adminUser.roleRef = superadminRole._id;
                adminUser.adminRole = "superadmin";
                await adminUser.save();
                console.log("🟢 Linked default admin user to superadmin roleRef");
            }
        }

        // Ensure 'itsfounder' or any user with role 'superadmin' has role 'admin', adminRole 'superadmin', and is linked to the roleRef
        const itsfounderUser = await userModel.findOne({ username: "itsfounder" });
        if (itsfounderUser) {
            let updated = false;
            if (itsfounderUser.role !== "admin") {
                itsfounderUser.role = "admin";
                updated = true;
            }
            if (itsfounderUser.adminRole !== "superadmin") {
                itsfounderUser.adminRole = "superadmin";
                updated = true;
            }
            if (!itsfounderUser.roleRef || String(itsfounderUser.roleRef) !== String(superadminRole._id)) {
                itsfounderUser.roleRef = superadminRole._id;
                updated = true;
            }
            if (updated) {
                await itsfounderUser.save();
                console.log("🟢 Updated 'itsfounder' to have role: 'admin', adminRole: 'superadmin', and roleRef linked");
            }
        }

        // Check if there are other users with role 'superadmin' (legacy) and update them as well
        const superadminUsers = await userModel.find({ role: "superadmin" });
        for (const u of superadminUsers) {
            u.role = "admin";
            u.adminRole = "superadmin";
            u.roleRef = superadminRole._id;
            await u.save();
            console.log(`🟢 Corrected role of superadmin user @${u.username} to admin/superadmin`);
        }
    } catch (err) {
        console.error("❌ Failed to seed default roles and superadmin:", err.message);
    }
};

const seedEmailTemplates = async () => {
    try {
        const EmailTemplate = require("./src/models/emailTemplate.model");
        const defaults = [
            {
                name: 'otp_verification',
                subject: '{{otp}} is your {{platform_name}} verification code',
                variables: ['otp', 'username', 'platform_name'],
                content: `<p class="greeting">Hi {{username}},</p>
<p class="text">
    Welcome to <strong>{{platform_name}}</strong>! Please verify your email address to complete your registration. Use the secure 6-digit verification code below:
</p>

<div class="highlight-card">
    <p class="highlight-value">{{otp}}</p>
    <p class="highlight-label">Temporary Access Token</p>
</div>

<p class="text" style="font-size: 13px; color: #94a3b8; text-align: center; margin-top: -10px;">
    ⚠️ This code is strictly confidential and expires in <strong>10 minutes</strong>.
</p>

<p class="text">
    If you did not initiate this request, someone may have typed your address by mistake. You can safely ignore this alert.
</p>`
            },
            {
                name: 'password_reset',
                subject: 'Reset Your Password - {{platform_name}}',
                variables: ['url', 'username', 'platform_name'],
                content: `<p class="greeting">Hello {{username}},</p>
<p class="text">
    We received a request to securely reset your password for your <strong>{{platform_name}}</strong> account. Please click the button below to complete the process:
</p>

<div class="btn-container">
    <a href="{{url}}" class="btn" target="_blank">Reset My Password</a>
</div>

<p class="text" style="font-size: 13px; color: #94a3b8; text-align: center;">
    ⚠️ This secure reset link is valid for <strong>20 minutes</strong>.
</p>

<p class="text" style="font-size: 13px; color: #64748b; background-color: #f1f5f9; padding: 12px; border-radius: 8px;">
    If you're having trouble clicking the button, copy and paste the URL below into your browser:<br>
    <a href="{{url}}" style="color: #4f46e5; word-break: break-all;">{{url}}</a>
</p>

<p class="text">
    If you did not request a password change, please ignore this email; your credentials will remain safe and unaltered.
</p>`
            },
            {
                name: 'welcome_email',
                subject: 'Welcome to {{platform_name}}! 🎉',
                variables: ['username', 'platform_name'],
                content: `<p class="greeting">Welcome to the Club, {{username}}! 🎉</p>
<p class="text">
    Your account is now fully verified and activated! We are thrilled to have you join <strong>{{platform_name}}</strong> — the ultimate social environment for your campus.
</p>

<p class="text">
    Here's what you can do right away to get started:
</p>

<ul class="text" style="padding-left: 20px; line-height: 1.8;">
    <li>📝 <strong>Share Confessions</strong> anonymously or with your handle.</li>
    <li>💬 <strong>Engage</strong> on interesting threads with fellow students.</li>
    <li>💖 <strong>Explore Dating</strong> to match up with matches around your campus.</li>
    <li>🔒 <strong>Safety First</strong>: Real-time moderation protects your privacy.</li>
</ul>

<p class="text">
    If you have any feedback or ideas to share, just send us an email. Our team is always eager to listen!
</p>`
            },
            {
                name: 'security_alert',
                subject: '🚨 Security Alert for your {{platform_name}} account',
                variables: ['username', 'action', 'ipAddress', 'device', 'time', 'platform_name'],
                content: `<p class="greeting">Security Alert: Action Required</p>
<p class="text">
    Hi {{username}}, we detected some critical activity or a login attempt on your <strong>{{platform_name}}</strong> account. Please review the transaction details below:
</p>

<table class="info-table">
    <tr>
        <td class="label">Trigger Action</td>
        <td class="value"><strong>{{action}}</strong></td>
    </tr>
    <tr>
        <td class="label">IP Address</td>
        <td class="value"><code>{{ipAddress}}</code></td>
    </tr>
    <tr>
        <td class="label">Device/OS</td>
        <td class="value">{{device}}</td>
    </tr>
    <tr>
        <td class="label">Date & Time</td>
        <td class="value">{{time}}</td>
    </tr>
</table>

<p class="text" style="color: #b91c1c; font-weight: 600;">
    🚩 If this was not you, your account credentials might have been compromised!
</p>

<p class="text">
    We highly recommend changing your password immediately and securing your collegiate email. You can trigger a password recovery sequence directly from the login page.
</p>`
            },
            {
                name: 'account_approval',
                subject: 'Your {{platform_name}} account has been approved',
                variables: ['username', 'platform_name'],
                content: `<p class="greeting">Dear {{username}},</p>
<p class="text">
    Your student identity has been verified successfully. You can now access <strong>{{platform_name}}</strong>.
</p>
<p class="text">
    Feel free to log in and start connecting with your fellow college peers right away!
</p>`
            },
            {
                name: 'account_rejection',
                subject: 'Student Verification Update - {{platform_name}}',
                variables: ['username', 'reason', 'platform_name'],
                content: `<p class="greeting">Dear {{username}},</p>
<p class="text">
    Thank you for your interest in joining <strong>{{platform_name}}</strong>. We have reviewed the college ID card verification you provided.
</p>
<p class="text">
    Unfortunately, your verification could not be approved at this time for the following reason:
</p>
<div style="background-color: #FEE2E2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0; border-radius: 4px; color: #991B1B;">
    <strong>Reason:</strong> {{reason}}
</div>
<p class="text">
    If you believe this was an error, please sign up again with a clearer picture of your student ID card or try verifying using a valid college email address.
</p>`
            }
        ];

        for (const def of defaults) {
            const exists = await EmailTemplate.findOne({ name: def.name });
            if (!exists) {
                await EmailTemplate.create(def);
                console.log(`🟢 Seeded default email template: ${def.name}`);
            }
        }
    } catch (err) {
        console.error("❌ Failed to seed email templates:", err.message);
    }
};

const startServer = async () => {
    try {
        await loadSettings();
        InfrastructureLogger.server("SUCCESS", "System settings successfully synchronized and loaded into memory.");
        
        // Wait for database connection before seeding
        if (mongoose.connection.readyState !== 1) {
            await new Promise((resolve) => {
                mongoose.connection.once("connected", resolve);
            });
        }
        await seedRolesAndSuperadmin();
        await seedEmailTemplates();
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

    server.listen(PORT, () => {
        InfrastructureLogger.server("SUCCESS", `Inistnt Enterprise Node Server is listening on port ${PORT} (Enterprise Cluster Mode)`);
    });
};

startServer();