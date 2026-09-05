const cron = require('node-cron');
const Message = require('../models/message.model');
const Confession = require('../models/confession.model');
const notificationModel = require('../models/notification.model');
const { deleteImage } = require('../utils/cloudinary');
const { getSetting } = require('../utils/settings');

/**
 * Dynamic Cleanup Job:
 * 1. Deletes chat messages older than chat_retention_hours (if > 0), including attached media.
 * 2. Deletes confessions/posts older than post_retention_days (if > 0), UNLESS reported.
 * 3. Deletes notifications older than notification_retention_days (if > 0).
 */
const runCleanupJob = async () => {
    console.log('🧹 [Cleanup Job] Starting database cleanup lifecycle...');

    const stats = {
        deletedMessages: 0,
        deletedMedia: 0,
        deletedConfessions: 0,
        deletedNotifications: 0,
        chatRetentionHours: Number(getSetting('chat_retention_hours', 24)),
        postRetentionDays: Number(getSetting('post_retention_days', 7)),
        notificationRetentionDays: Number(getSetting('notification_retention_days', 14)),
        executedAt: new Date(),
        status: 'SUCCESS'
    };

    try {
        const now = new Date();

        // ── 1. Clean up Messages (Dynamic Hours) ─────────────────────────────
        if (stats.chatRetentionHours > 0) {
            const chatCutoff = new Date(now.getTime() - stats.chatRetentionHours * 60 * 60 * 1000);
            
            // Delete media from Cloudinary first
            const messagesWithMedia = await Message.find({
                createdAt: { $lt: chatCutoff },
                mediaUrl: { $exists: true, $ne: null }
            }).select('mediaUrl');

            for (const msg of messagesWithMedia) {
                if (msg.mediaUrl && msg.mediaUrl.includes('cloudinary.com')) {
                    try {
                        await deleteImage(msg.mediaUrl);
                        stats.deletedMedia++;
                    } catch (mediaErr) {
                        console.error('Failed to remove Cloudinary media:', mediaErr.message);
                    }
                }
            }

            const messageDeleteResult = await Message.deleteMany({
                createdAt: { $lt: chatCutoff }
            });
            stats.deletedMessages = messageDeleteResult.deletedCount || 0;
            console.log(`   - Deleted ${stats.deletedMessages} messages older than ${stats.chatRetentionHours}h (${stats.deletedMedia} media files removed)`);
        } else {
            console.log('   - Chat retention disabled (chat_retention_hours = 0). Keeping all messages.');
        }

        // ── 2. Clean up Confessions/Posts (Dynamic Days) ────────────────────
        if (stats.postRetentionDays > 0) {
            const postCutoff = new Date(now.getTime() - stats.postRetentionDays * 24 * 60 * 60 * 1000);
            
            const confessionDeleteResult = await Confession.deleteMany({
                createdAt: { $lt: postCutoff },
                $or: [
                    { reports: { $exists: false } },
                    { reports: { $size: 0 } }
                ]
            });
            stats.deletedConfessions = confessionDeleteResult.deletedCount || 0;
            console.log(`   - Deleted ${stats.deletedConfessions} confessions older than ${stats.postRetentionDays}d (Protected reported ones)`);
        } else {
            console.log('   - Post retention disabled (post_retention_days = 0). Keeping all posts.');
        }

        // ── 3. Clean up Notifications (Dynamic Days) ────────────────────────
        if (stats.notificationRetentionDays > 0) {
            const notifCutoff = new Date(now.getTime() - stats.notificationRetentionDays * 24 * 60 * 60 * 1000);
            const notificationDeleteResult = await notificationModel.deleteMany({
                createdAt: { $lt: notifCutoff }
            });
            stats.deletedNotifications = notificationDeleteResult.deletedCount || 0;
            console.log(`   - Deleted ${stats.deletedNotifications} notifications older than ${stats.notificationRetentionDays}d`);
        }

        console.log(`✅ [Cleanup Job] Finished successfully at ${stats.executedAt.toISOString()}`);
        return stats;
    } catch (error) {
        console.error('❌ [Cleanup Job] Failed to run cleanup:', error.message);
        stats.status = 'ERROR';
        stats.error = error.message;
        return stats;
    }
};

// Schedule job to run at minute 0 past every hour (0 * * * *)
const initCleanupCron = () => {
    cron.schedule('0 * * * *', runCleanupJob);
    console.log('🕒 [Cron] Cleanup job scheduled to run every hour.');
};

module.exports = { initCleanupCron, runCleanupJob };
