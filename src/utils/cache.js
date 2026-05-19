/**
 * Unified cache utility.
 * 
 * - If Redis is available (REDIS_URL set): uses Redis → works across PM2 cluster processes
 * - If Redis is not available: falls back to node-cache → works in single process
 * 
 * Usage:
 *   const { withCache, invalidate } = require('./cache');
 * 
 *   // Cache DB result for 60 seconds
 *   const data = await withCache('explore:page:1', 60, async () => {
 *       return await postModel.find(...);
 *   });
 * 
 *   // Invalidate when data changes
 *   await invalidate('explore:page:1');
 */

const NodeCache = require('node-cache');
const { redisClient } = require('./redis');

// Fallback: in-memory cache (single-process only)
const localCache = new NodeCache({ stdTTL: 60, checkperiod: 120, useClones: false });

const isRedisAvailable = () => redisClient && redisClient.status === 'ready';

/**
 * Get a cached value or compute and store it.
 * @param {string} key  Cache key
 * @param {number} ttl  TTL in seconds
 * @param {Function} fn Async function returning the value to cache
 */
const withCache = async (key, ttl, fn) => {
    if (isRedisAvailable()) {
        // Try Redis
        const cached = await redisClient.get(key);
        if (cached !== null) {
            try { return JSON.parse(cached); } catch { /* invalid JSON, recompute */ }
        }
        const value = await fn();
        await redisClient.setex(key, ttl, JSON.stringify(value));
        return value;
    } else {
        // Fall back to node-cache
        const cached = localCache.get(key);
        if (cached !== undefined) return cached;
        const value = await fn();
        localCache.set(key, value, ttl);
        return value;
    }
};

/**
 * Invalidate a specific cache key.
 */
const invalidate = async (key) => {
    if (isRedisAvailable()) {
        await redisClient.del(key);
    } else {
        localCache.del(key);
    }
};

/**
 * Invalidate all keys starting with a prefix.
 * e.g., invalidatePattern('explore:') removes all explore pages.
 */
const invalidatePattern = async (prefix) => {
    if (isRedisAvailable()) {
        // Redis SCAN instead of KEYS to avoid blocking
        let cursor = '0';
        do {
            const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) await redisClient.del(...keys);
        } while (cursor !== '0');
    } else {
        const keys = localCache.keys().filter(k => k.startsWith(prefix));
        localCache.del(keys);
    }
};

module.exports = { withCache, invalidate, invalidatePattern };
