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

        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const key = `${prefix}:${ip}`;

        try {
            const current = await redisClient.get(key);
            
            if (current && parseInt(current) >= max) {
                InfrastructureLogger.rateLimit("WARNING", `Rate limit exceeded for IP: ${ip} on route ${req.originalUrl}. Request blocked.`, {
                    ip,
                    route: req.originalUrl,
                    prefix,
                    currentRequests: parseInt(current),
                    maxRequests: max,
                    windowMs
                }, req.user ? req.user._id : null);

                return res.status(429).json({
                    message: "Too many requests. Please try again later.",
                    retryAfter: Math.ceil(windowMs / 1000)
                });
            }

            if (!current) {
                await redisClient.set(key, 1, 'PX', windowMs);
            } else {
                await redisClient.incr(key);
            }

            next();
        } catch (err) {
            InfrastructureLogger.rateLimit("ERROR", `Rate limiter Redis error for IP ${ip}: ${err.message}. Failing open.`, {
                ip,
                route: req.originalUrl,
                error: err.stack
            });
            next(); // Fail open in production if redis is down
        }
    };
};

module.exports = rateLimiter;
