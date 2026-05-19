const { redisClient } = require('../utils/redis');

/**
 * Cache Wrapper for Enterprise Scale
 */
const cache = {
    /**
     * Get or set cache
     * @param {string} key 
     * @param {number} ttl - seconds
     * @param {Function} fetcher - function to call if cache miss
     */
    getOrSet: async (key, ttl, fetcher) => {
        if (!redisClient) return await fetcher();

        try {
            const cachedValue = await redisClient.get(key);
            if (cachedValue) {
                return JSON.parse(cachedValue);
            }

            const freshValue = await fetcher();
            if (freshValue !== undefined && freshValue !== null) {
                await redisClient.setex(key, ttl, JSON.stringify(freshValue));
            }
            return freshValue;
        } catch (err) {
            console.error(`Redis Cache Error [${key}]:`, err);
            return await fetcher();
        }
    },

    invalidate: async (pattern) => {
        if (!redisClient) return;
        try {
            if (pattern.includes('*')) {
                const keys = await redisClient.keys(pattern);
                if (keys.length > 0) {
                    await redisClient.del(...keys);
                }
            } else {
                await redisClient.del(pattern);
            }
        } catch (err) {
            console.error(`Redis Invalidation Error [${pattern}]:`, err);
        }
    }
};

module.exports = cache;
