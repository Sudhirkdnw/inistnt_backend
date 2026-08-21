const userModel = require('../models/user.model');
const confessionModel = require('../models/confession.model');
const subscriptionModel = require('../models/subscription.model');
const { deleteImage } = require('../utils/cloudinary');
const cache = require('../service/cache.service');
const { invalidateUserCache } = require('../middlewares/cacheMiddleware');
const InfrastructureLogger = require('../utils/infrastructureLogger');

let isWorkerRunning = false;

/**
 * Permanently delete Cloudinary images and clear media arrays for expired photo confessions.
 * Note: The text content of the confession is preserved as a regular text confession!
 */
async function cleanupExpiredPremiumPosts() {
    try {
        const now = new Date();

        // 1. Find photo confessions that have reached their mediaExpireAt date
        const expiredPosts = await confessionModel.find({
            isPremiumPost: true,
            mediaStatus: 'ACTIVE',
            mediaExpireAt: { $ne: null, $lte: now }
        }).select('_id user media confessionText');

        // 2. Also find photo confessions whose owner is no longer premium
        const activePhotoPosts = await confessionModel.find({
            isPremiumPost: true,
            mediaStatus: 'ACTIVE'
        }).populate('user', 'isPremium premiumExpireAt').select('_id user media confessionText');

        const nonPremiumOwnerPosts = activePhotoPosts.filter(post => {
            if (!post.user) return true; // Orphaned post
            const isUserPremium = post.user.isPremium && post.user.premiumExpireAt && new Date(post.user.premiumExpireAt) > now;
            return !isUserPremium;
        });

        // Deduplicate post IDs
        const postMap = new Map();
        [...expiredPosts, ...nonPremiumOwnerPosts].forEach(post => {
            postMap.set(post._id.toString(), post);
        });

        const postsToProcess = Array.from(postMap.values());

        if (postsToProcess.length === 0) {
            return { processedCount: 0, deletedImagesCount: 0 };
        }

        InfrastructureLogger.security("INFO", `[SubscriptionCleanup] Found ${postsToProcess.length} expired premium photo confessions to purge.`);

        let deletedImagesCount = 0;

        for (const post of postsToProcess) {
            try {
                // Delete all media from Cloudinary
                if (Array.isArray(post.media) && post.media.length > 0) {
                    for (const item of post.media) {
                        const targetId = item.publicId || item.url;
                        if (targetId && (targetId.includes("cloudinary.com") || !targetId.startsWith("http"))) {
                            try {
                                await deleteImage(targetId);
                                deletedImagesCount++;
                            } catch (delErr) {
                                console.warn(`[SubscriptionCleanup] Cloudinary delete failed for ${targetId}:`, delErr.message);
                            }
                        }
                    }
                }

                // Update post: remove media, mark EXPIRED, convert postType to TEXT (preserving confession text!)
                await confessionModel.findByIdAndUpdate(post._id, {
                    media: [],
                    mediaStatus: 'EXPIRED',
                    postType: 'TEXT',
                    isPremiumPost: false
                });

                if (post.user?._id) {
                    invalidateUserCache(post.user._id);
                }
            } catch (postErr) {
                console.error(`[SubscriptionCleanup] Error processing post ${post._id}:`, postErr.message);
            }
        }

        // Invalidate feed cache keys in Redis
        try {
            await cache.clearByPrefix('feed');
            await cache.clearByPrefix('explore');
            await cache.clearByPrefix('hot');
        } catch (cacheErr) {
            console.warn('[SubscriptionCleanup] Cache clear warning:', cacheErr.message);
        }

        InfrastructureLogger.security("SUCCESS", `[SubscriptionCleanup] Successfully purged ${postsToProcess.length} expired photo confessions (${deletedImagesCount} Cloudinary images destroyed).`);

        return { processedCount: postsToProcess.length, deletedImagesCount };
    } catch (err) {
        console.error('[SubscriptionCleanup] Error in cleanupExpiredPremiumPosts:', err);
        return { processedCount: 0, deletedImagesCount: 0, error: err.message };
    }
}

/**
 * Check and expire subscriptions for users whose premium validity has elapsed.
 */
async function checkAndExpireSubscriptions() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    try {
        const now = new Date();

        // 1. Mark expired active subscriptions in subscriptionModel
        await subscriptionModel.updateMany(
            { status: 'active', endDate: { $lte: now } },
            { $set: { status: 'expired' } }
        );

        // 2. Find users whose premium expired
        const expiredUsers = await userModel.find({
            isPremium: true,
            premiumExpireAt: { $ne: null, $lte: now }
        }).select('_id username photos avatar');

        for (const u of expiredUsers) {
            // Delete extra gallery photos if user had any
            if (Array.isArray(u.photos) && u.photos.length > 0) {
                for (const photoUrl of u.photos) {
                    if (photoUrl && photoUrl.includes("cloudinary.com")) {
                        try {
                            await deleteImage(photoUrl);
                        } catch (e) {
                            console.warn(`[SubscriptionCleanup] Failed to delete user photo ${photoUrl}:`, e.message);
                        }
                    }
                }
            }

            await userModel.findByIdAndUpdate(u._id, {
                isPremium: false,
                premiumExpireAt: null,
                photos: []
            });

            invalidateUserCache(u._id);
        }

        // 3. Process expired photo confessions
        await cleanupExpiredPremiumPosts();
    } catch (err) {
        console.error('[SubscriptionCleanup] Global checkAndExpireSubscriptions error:', err);
    } finally {
        isWorkerRunning = false;
    }
}

/**
 * Start background periodic cleanup worker
 */
function startSubscriptionCleanupWorker(intervalMs = 2 * 60 * 1000) {
    InfrastructureLogger.server("INFO", `[SubscriptionCleanupWorker] Initializing 2-minute periodic subscription & photo purge worker.`);
    
    // Run once on startup
    setTimeout(() => {
        checkAndExpireSubscriptions().catch(err => console.error('[SubscriptionCleanupWorker] Startup run error:', err));
    }, 5000);

    // Schedule recurring interval
    const timer = setInterval(() => {
        checkAndExpireSubscriptions().catch(err => console.error('[SubscriptionCleanupWorker] Recurring run error:', err));
    }, intervalMs);

    return timer;
}

module.exports = {
    cleanupExpiredPremiumPosts,
    checkAndExpireSubscriptions,
    startSubscriptionCleanupWorker
};
