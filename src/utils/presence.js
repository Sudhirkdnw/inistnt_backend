/**
 * Chat Presence & Active Conversation Tracker
 * 
 * Tracks which conversations users are actively viewing across devices/sockets.
 * Enables zero-latency suppression of redundant in-app and push notifications.
 */

const { redisClient } = require('./redis');

// In-Memory map: userId -> Map(socketId -> conversationId)
const userActiveConversations = new Map();

/**
 * Register that a user's socket is actively viewing a conversation.
 * @param {string} userId 
 * @param {string} socketId 
 * @param {string} conversationId 
 */
async function setUserActiveConversation(userId, socketId, conversationId) {
    if (!userId || !conversationId) return;
    const uid = String(userId);
    const cid = String(conversationId);
    const sid = String(socketId);

    // 1. In-Memory Registration
    if (!userActiveConversations.has(uid)) {
        userActiveConversations.set(uid, new Map());
    }
    userActiveConversations.get(uid).set(sid, cid);

    // 2. Redis Registration (if available for multi-process clusters)
    if (redisClient && redisClient.status === 'ready') {
        try {
            await redisClient.sadd(`active_conv:${uid}`, cid);
            await redisClient.expire(`active_conv:${uid}`, 3600); // 1 hour safety TTL
        } catch (e) {
            // Ignore background redis errors
        }
    }
}

/**
 * Remove active conversation status for a specific socket/user.
 * @param {string} userId 
 * @param {string} socketId 
 * @param {string} [conversationId] 
 */
async function removeUserActiveConversation(userId, socketId, conversationId) {
    if (!userId) return;
    const uid = String(userId);
    const sid = String(socketId);

    // 1. In-Memory Removal
    if (userActiveConversations.has(uid)) {
        const socketMap = userActiveConversations.get(uid);
        const currentCid = socketMap.get(sid);
        socketMap.delete(sid);

        if (socketMap.size === 0) {
            userActiveConversations.delete(uid);
        }

        // 2. Redis Removal
        const targetCid = conversationId ? String(conversationId) : currentCid;
        if (targetCid && redisClient && redisClient.status === 'ready') {
            try {
                // Check if user has any other active socket on the same conversation
                const hasOtherSocketInSameConv = Array.from(socketMap.values()).includes(targetCid);
                if (!hasOtherSocketInSameConv) {
                    await redisClient.srem(`active_conv:${uid}`, targetCid);
                }
            } catch (e) {
                // Ignore background redis errors
            }
        }
    }
}

/**
 * Clean up all active presence when a socket disconnects.
 * @param {string} socketId 
 * @param {string} [userId] 
 */
async function cleanupSocketPresence(socketId, userId) {
    const sid = String(socketId);

    if (userId) {
        await removeUserActiveConversation(userId, sid);
        return;
    }

    // If userId not provided, scan all users
    for (const [uid, socketMap] of userActiveConversations.entries()) {
        if (socketMap.has(sid)) {
            const cid = socketMap.get(sid);
            socketMap.delete(sid);
            if (socketMap.size === 0) {
                userActiveConversations.delete(uid);
            }
            if (cid && redisClient && redisClient.status === 'ready') {
                try {
                    await redisClient.srem(`active_conv:${uid}`, cid);
                } catch (e) {}
            }
            break;
        }
    }
}

/**
 * Check if a user is currently actively viewing a specific conversation.
 * @param {string} userId 
 * @param {string} conversationId 
 * @returns {Promise<boolean>}
 */
async function isUserActiveInConversation(userId, conversationId) {
    if (!userId || !conversationId) return false;
    const uid = String(userId);
    const cid = String(conversationId);

    // 1. In-Memory Check (Instant & Zero Latency)
    if (userActiveConversations.has(uid)) {
        const socketMap = userActiveConversations.get(uid);
        for (const activeCid of socketMap.values()) {
            if (String(activeCid) === cid) {
                return true;
            }
        }
    }

    // 2. Redis Check (for multi-server cluster instances)
    if (redisClient && redisClient.status === 'ready') {
        try {
            const isActive = await redisClient.sismember(`active_conv:${uid}`, cid);
            if (isActive === 1) return true;
        } catch (e) {
            // fallback to memory
        }
    }

    return false;
}

module.exports = {
    setUserActiveConversation,
    removeUserActiveConversation,
    cleanupSocketPresence,
    isUserActiveInConversation
};
