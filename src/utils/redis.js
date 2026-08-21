/**
 * Redis client (ioredis) — shared connection for cache + Socket.IO adapter.
 *
 * Falls back gracefully: if Redis is not configured (no REDIS_URL),
 * the app still works using node-cache (single-process only).
 */
const Redis = require('ioredis');

let redisClient = null;
let redisSubscriber = null;

// Promises that resolve once each connection is ready
let redisReady = Promise.resolve();

const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
    const options = {
        // enableOfflineQueue: true (default) — queue commands until connected
        // DO NOT set to false: the Socket.IO adapter calls psubscribe on init
        // before the TCP connection is established, causing a crash.
        lazyConnect: false,
        pingInterval: 10000, // Sends PING at app layer every 10s
        keepAlive: 10000,    // TCP level keep-alive to prevent cloud timeouts
        family: 0, // Auto-detect IPv4/IPv6
        maxRetriesPerRequest: null, // Critical for long-running pub/sub & socket.io
        retryStrategy: (times) => {
            // Keep reconnecting continuously with exponential backoff (never return null)
            return Math.min(times * 500, 5000); 
        },
        reconnectOnError: (err) => {
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
                return true;
            }
            return false;
        },
        tls: REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined, // Allow self-signed/cloud certificates
    };

    redisClient     = new Redis(REDIS_URL, options);
    redisSubscriber = new Redis(REDIS_URL, options); // Separate connection for pub/sub

    redisClient.on('connect',       () => console.log('✅ Redis connected (cache)'));
    redisClient.on('ready',         () => console.log('✅ Redis ready (cache)'));
    redisClient.on('error',         (err) => console.log('ℹ️  Redis cache status:', err.message));
    redisClient.on('close',         () => console.log('ℹ️  Redis cache connection closed, reconnecting...'));

    redisSubscriber.on('connect',   () => console.log('✅ Redis connected (pubsub)'));
    redisSubscriber.on('ready',     () => console.log('✅ Redis ready (pubsub)'));
    redisSubscriber.on('error',     (err) => console.log('ℹ️  Redis pubsub status:', err.message));
    redisSubscriber.on('close',     () => console.log('ℹ️  Redis pubsub connection closed, reconnecting...'));

    // Wait for BOTH connections to be ready before server.js attaches the adapter
    redisReady = Promise.all([
        new Promise((res) => {
            if (redisClient.status === 'ready') return res();
            redisClient.once('ready', res);
            redisClient.once('error', () => res()); // Don't block server if Redis fails initially
        }),
        new Promise((res) => {
            if (redisSubscriber.status === 'ready') return res();
            redisSubscriber.once('ready', res);
            redisSubscriber.once('error', () => res());
        }),
    ]);
} else {
    console.log('ℹ️  REDIS_URL not set — using in-memory cache (single-process only)');
}

module.exports = { redisClient, redisSubscriber, redisReady };
