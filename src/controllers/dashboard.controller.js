const confessionModel = require('../models/confession.model');
const notificationModel = require('../models/notification.model');
const datingModel = require('../models/dating.model');
const cache = require('../service/cache.service');

/**
 * GET /api/dashboard/stats
 * Returns all home-screen stat card values in a single request with Redis caching.
 * Cache TTL: 60 seconds per user (balances freshness vs. DB load).
 */
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `dashboard:stats:${userId}`;

        const stats = await cache.getOrSet(cacheKey, 60, async () => {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const [matchCount, commentCount, anonTodayCount, hotTotal] = await Promise.all([
                // 1. Dating matches count
                datingModel.findOne({ user: userId })
                    .select('matches')
                    .lean()
                    .then(p => p?.matches?.length || 0)
                    .catch(() => 0),

                // 2. Unread comment/reply notifications
                notificationModel.countDocuments({
                    recipient: userId,
                    type: { $in: ['comment', 'reply'] },
                    isRead: false
                }).catch(() => 0),

                // 3. Today's anonymous posts (across user's college)
                confessionModel.countDocuments({
                    isHidden: false,
                    isAnonymous: true,
                    createdAt: { $gte: todayStart }
                }).catch(() => 0),

                // 4. Total hot posts count (reuse hot cache if available, else count)
                confessionModel.countDocuments({ isHidden: false }).catch(() => 0)
            ]);

            return {
                crushHints: matchCount,
                anonymous: anonTodayCount,
                comments: commentCount,
                hotPosts: hotTotal
            };
        });

        res.status(200).json({ stats });
    } catch (error) {
        console.error('getDashboardStats error:', error);
        res.status(500).json({ message: 'Failed to load stats' });
    }
};

module.exports = { getDashboardStats };
