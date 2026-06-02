const jwt = require('jsonwebtoken');
const { redisClient } = require('../utils/redis');
const InfrastructureLogger = require('../utils/infrastructureLogger');

/**
 * Distributed Rate Limiter for Enterprise Scale
 * @param {Object} options 
 * @param {number} options.windowMs - time window in ms
 * @param {number} options.max - max requests per window
 * @param {string} options.prefix - unique prefix for this limiter
 */
const rateLimiter = ({ windowMs = 60000, max = 100, prefix = 'rl' }) => {
    return async (req, res, next) => {
        if (!redisClient) return next();

        let userId = null;
        let token = req.cookies ? req.cookies.token : null;

        if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (token) {
            try {
                // Decode token to extract user ID without DB trip
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch (err) {
                // Fail silently, fallback to IP rate limiting
            }
        }

        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const key = userId ? `${prefix}:user:${userId}` : `${prefix}:ip:${ip}`;

        try {
            const current = await redisClient.incr(key);

            // Set expiration on first request in the window
            if (current === 1) {
                await redisClient.pexpire(key, windowMs);
            } else {
                // Auto-heal logic: If the key somehow has no TTL (TTL = -1), set it now to prevent permanent blocks
                const ttl = await redisClient.pttl(key);
                if (ttl < 0) {
                    await redisClient.pexpire(key, windowMs);
                }
            }

            if (current > max) {
                InfrastructureLogger.rateLimit("WARNING", `Rate limit exceeded for ${userId ? `User: ${userId}` : `IP: ${ip}`} on route ${req.originalUrl}. Request blocked.`, {
                    ip,
                    userId,
                    route: req.originalUrl,
                    prefix,
                    currentRequests: current,
                    maxRequests: max,
                    windowMs
                }, userId || null);

                return res.status(429).json({
                    message: "Too many requests. Please try again later.",
                    retryAfter: Math.ceil(windowMs / 1000)
                });
            }

            next();
        } catch (err) {
            InfrastructureLogger.rateLimit("ERROR", `Rate limiter Redis error for ${userId ? `User ${userId}` : `IP ${ip}`}: ${err.message}. Failing open.`, {
                ip,
                userId,
                route: req.originalUrl,
                error: err.stack
            });
            next(); // Fail open in production if redis is down
        }
    };
};

module.exports = rateLimiter;
