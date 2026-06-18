const express = require('express');
const cookieParser = require("cookie-parser");
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const confessionRoutes = require('./routes/confession.routes');
const userRoutes = require('./routes/user.routes');
const storyRoutes = require('./routes/story.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminRoutes = require('./routes/admin.routes');
const aiRoutes = require('./routes/ai.routes');
const chatRoutes = require('./routes/chat.routes');
const datingRoutes = require('./routes/dating.routes');
const reportRoutes = require('./routes/report.routes');
const monitoringRoutes = require('./routes/monitoring.routes');
const collegeRoutes = require('./routes/college.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const cors = require('cors');

const app = express();
app.use(express.static("public"));


// Trust proxy for correct IP detection in rate limiting (AWS, Nginx, etc.)
app.set('trust proxy', 1);

// Dynamic dotenv load safeguard for isolated imports (like Jest running app.js directly)
if (!process.env.MONGO_URI) {
    const dotenv = require('dotenv');
    const path = require('path');
    const nodeEnv = process.env.NODE_ENV || 'development';
    dotenv.config({ path: path.resolve(__dirname, `../.env.${nodeEnv}`) });
    dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

// CORS — allow main client, admin panel (dev), and production origins
const ALLOWED_ORIGINS = [
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : []),
    'https://hykee.in',
    'https://www.hykee.in',
    'https://admin.hykee.in',

].filter(Boolean).map(o => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        // Always allow localhost and local network private IPs in development
        if (process.env.NODE_ENV !== 'production') {
            const isLocal = origin.startsWith('http://localhost') ||
                origin.startsWith('http://127.0.0.1') ||
                origin.startsWith('http://192.168.') ||
                origin.startsWith('http://10.') ||
                origin.startsWith('http://172.');
            if (isLocal) {
                return callback(null, true);
            }
        }

        // Check if origin matches allowed origins or is a Vercel preview (optional)
        const isAllowed = ALLOWED_ORIGINS.some(allowed =>
            origin === allowed ||
            origin.startsWith(allowed)
        ) || origin.endsWith('.vercel.app');

        if (isAllowed) {
            return callback(null, true);
        }
        callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// Security headers
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

// Gzip compress all responses — saves ~70% bandwidth
app.use(compression({ level: 6, threshold: 1024 }));

app.use(express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const maintenanceMiddleware = require('./middlewares/maintenanceMiddleware');
const authMiddleware = require('./middlewares/authmiddleware');

// For routes that need to know user role during maintenance, we need auth first.
// But we also want to block guests. 
// I'll make maintenanceMiddleware handle both.
app.use(maintenanceMiddleware);

const settingsRoutes = require("./routes/settings.routes");

const rateLimiter = require('./middlewares/rateLimiter');
const setupSwagger = require('./config/swagger');

// Setup Swagger API Docs
setupSwagger(app);

// API Routes
app.use("/api/auth", rateLimiter({ windowMs: 15 * 60 * 1000, max: 100, prefix: 'auth' }), authRoutes);
app.use("/api/confessions", rateLimiter({ windowMs: 60 * 1000, max: 150, prefix: 'confessions' }), confessionRoutes);
app.use("/api/users", rateLimiter({ windowMs: 60 * 1000, max: 100, prefix: 'users' }), userRoutes);
app.use("/api/stories", rateLimiter({ windowMs: 60 * 1000, max: 60, prefix: 'stories' }), storyRoutes);
app.use("/api/notifications", rateLimiter({ windowMs: 60 * 1000, max: 60, prefix: 'notifs' }), notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/chat", rateLimiter({ windowMs: 60 * 1000, max: 200, prefix: 'chat' }), chatRoutes);
app.use("/api/dating", rateLimiter({ windowMs: 60 * 1000, max: 100, prefix: 'dating' }), datingRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/monitoring", monitoringRoutes);
app.use("/api/colleges", collegeRoutes);
app.use("/api/dashboard", rateLimiter({ windowMs: 60 * 1000, max: 60, prefix: 'dashboard' }), dashboardRoutes);

app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve frontend in production (SPA catch-all)
if (process.env.NODE_ENV === "production") {
    const fs = require('fs');
    const indexPath = path.join(__dirname, "../public/index.html");

    app.use(express.static(path.join(__dirname, "../public")));

    app.use((req, res) => {
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(200).json({
                status: "success",
                message: "Hykee API Server is running in production mode.",
                timestamp: new Date().toISOString()
            });
        }
    });
}



module.exports = app;
