const { getSetting } = require('../utils/settings');

/**
 * Middleware to block access during maintenance mode
 */
const maintenanceMiddleware = async (req, res, next) => {
    const isMaintenance = getSetting('maintenance_mode', false);
    
    // Always allow health checks, public settings, and authentication routes
    const allowedPaths = [
        '/api/health',
        '/api/settings/public',
        '/api/auth/login',
        '/api/auth/verify-admin-otp',
        '/api/auth/resend-otp',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/api/auth/logout'
    ];

    const isAllowed = allowedPaths.some(p => {
        return req.path === p || req.path.startsWith(p + '/');
    }) || req.path.startsWith('/api/admin');

    if (!isMaintenance || isAllowed) {
        return next();
    }

    // Try to see if requester is an admin to bypass
    let token = req.cookies?.token;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }
    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            const userModel = require('../models/user.model');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await userModel.findById(decoded.id);
            if (user && user.role === 'admin') {
                return next();
            }
        } catch (err) {
            // Token invalid, ignore
        }
    }

    res.status(503).json({
        message: "Platform is under maintenance",
        status: "maintenance",
        retryAfter: 3600, // 1 hour
        details: getSetting('maintenance_message', "We are performing system upgrades. Please check back later.")
    });
};

module.exports = maintenanceMiddleware;
