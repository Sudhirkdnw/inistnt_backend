const { redisClient } = require('../utils/redis');
const InfrastructureLogger = require('../utils/infrastructureLogger');

/**
 * Middleware to cache API responses using Redis.
 * @param {number} durationInSeconds - Cache Time To Live (TTL) in seconds.
 */
const cacheMiddleware = (durationInSeconds = 60) => {
    return async (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        if (!redisClient) {
            return next(); // Fallback if Redis is unavailable
        }

        try {
            // Generate a unique cache key based on URL and query params
            // Also prefixing with user ID if it's a personalized route
            const userPrefix = req.user && req.user._id ? `${req.user._id}:` : 'global:';
            const cacheKey = `cache:${userPrefix}${req.originalUrl || req.url}`;

            const cachedResponse = await redisClient.get(cacheKey);

            if (cachedResponse) {
                // If found in cache, send the cached response immediately
                InfrastructureLogger.redis("INFO", `Cache HIT for ${cacheKey}`);
                const data = JSON.parse(cachedResponse);
                return res.status(200).json(data);
            }

            // If not found in cache, we intercept the res.json method
            // to capture the response data and cache it before sending
            const originalJson = res.json;
            
            res.json = function(body) {
                // Restore original method to avoid infinite loops
                res.json = originalJson;

                // Cache the response if status is 200
                if (res.statusCode === 200) {
                    try {
                        redisClient.setex(cacheKey, durationInSeconds, JSON.stringify(body))
                            .catch(err => {
                                InfrastructureLogger.redis("ERROR", `Failed to set cache for ${cacheKey}: ${err.message}`);
                            });
                    } catch (err) {
                         InfrastructureLogger.redis("ERROR", `Failed to stringify cache body for ${cacheKey}: ${err.message}`);
                    }
                }

                // Call the original res.json
                return originalJson.call(this, body);
            };

            next();
        } catch (err) {
            InfrastructureLogger.redis("ERROR", `Cache middleware error: ${err.message}`);
            next(); // Proceed to route handler if caching fails
        }
    };
};

/**
 * Invalidate cache keys matching one or more patterns or user IDs
 */
async function invalidateUserCache(...userIds) {
    if (!redisClient) return;
    try {
        for (const uid of userIds) {
            if (!uid) continue;
            const strId = String(uid);
            // Search keys prefixed with user ID or containing the route /users/:id
            const patterns = [
                `cache:${strId}:*`,
                `cache:*${strId}*`,
                `cache:*:*/api/users/${strId}*`,
                `cache:*:*/api/users/suggestions*`,
                `cache:*:*/api/users/search*`
            ];
            for (const pattern of patterns) {
                const keys = await redisClient.keys(pattern);
                if (keys && keys.length > 0) {
                    await redisClient.del(...keys);
                }
            }
        }
    } catch (e) {
        console.warn("⚠️ Cache invalidation error (graceful skip):", e.message);
    }
}

module.exports = cacheMiddleware;
module.exports.cacheMiddleware = cacheMiddleware;
module.exports.invalidateUserCache = invalidateUserCache;
