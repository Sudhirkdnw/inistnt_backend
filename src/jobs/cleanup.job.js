const cron = require('node-cron');
const Message = require('../models/message.model');
const Confession = require('../models/confession.model');
const { deleteImage } = require('../utils/cloudinary');

/**
 * Cleanup Job: Runs every hour.
 * 1. Deletes messages older than 24 hours, including attached Cloudinary media.
 * 2. Deletes confessions older than 7 days, UNLESS they have been reported.
 */
const runCleanupJob = async () => {
    console.log('🧹 [Cleanup Job] Starting database cleanup...');

    try {
        const now = new Date();

        // --- 1. Clean up Messages (Older than 24 hours) ---
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Find messages older than 24h that have media to delete from Cloudinary first
        const messagesWithMedia = await Message.find({
            createdAt: { $lt: twentyFourHoursAgo },
            mediaUrl: { $exists: true, $ne: null }
        });

        let mediaDeletedCount = 0;
        for (const msg of messagesWithMedia) {
            if (msg.mediaUrl && msg.mediaUrl.includes('cloudinary.com')) {
                await deleteImage(msg.mediaUrl);
                mediaDeletedCount++;
            }
        }

        // Now delete all messages older than 24h from DB
        const messageDeleteResult = await Message.deleteMany({
            createdAt: { $lt: twentyFourHoursAgo }
        });

        // --- 2. Clean up Confessions (Older than 7 days, not reported) ---
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const confessionDeleteResult = await Confession.deleteMany({
            createdAt: { $lt: sevenDaysAgo },
            $or: [
                { reports: { $exists: false } },
                { reports: { $size: 0 } }
            ]
        });

        console.log(`✅ [Cleanup Job] Finished.`);
        console.log(`   - Deleted ${messageDeleteResult.deletedCount} old messages (${mediaDeletedCount} media files removed from Cloudinary)`);
        console.log(`   - Deleted ${confessionDeleteResult.deletedCount} old confessions (Ignored reported ones)`);

    } catch (error) {
        console.error('❌ [Cleanup Job] Failed to run cleanup:', error.message);
    }
};

// Schedule job to run at minute 0 past every hour (0 * * * *)
const initCleanupCron = () => {
    cron.schedule('0 * * * *', runCleanupJob);
    console.log('🕒 [Cron] Cleanup job scheduled to run every hour.');
    
    // Optional: run immediately on startup for testing/initial sweep
    // runCleanupJob();
};

module.exports = { initCleanupCron, runCleanupJob };
