const cron = require('node-cron');
const userModel = require('../models/user.model');

/**
 * Permanent Deletion Service
 * Runs every day at midnight (00:00)
 */
const initCronJobs = () => {
    cron.schedule('0 0 * * *', async () => {
        console.log('🧹 Running scheduled permanent deletion cleanup...');
        try {
            const now = new Date();
            
            // Find users whose scheduledDeletionAt has passed
            const usersToDelete = await userModel.find({
                isSoftDeleted: true,
                scheduledDeletionAt: { $lte: now }
            });

            if (usersToDelete.length === 0) {
                console.log('✅ No accounts scheduled for permanent deletion today.');
                return;
            }

            for (const user of usersToDelete) {
                console.log(`🗑️ Permanently deleting user: ${user.username} (${user._id})`);
                
                // 1. Delete associated data if necessary (posts, comments, etc.)
                // Note: For some platforms, we might anonymize instead of delete.
                // Here we'll do a full delete of the user document.
                // Related data (posts) should ideally be handled via cascades or anonymization logic.
                
                // For now, we'll just delete the user. 
                // You can add more complex data cleanup here.
                await userModel.findByIdAndDelete(user._id);
            }

            console.log(`✅ Successfully processed ${usersToDelete.length} permanent deletions.`);
        } catch (error) {
            console.error('❌ Error during permanent deletion cleanup:', error);
        }
    });

    // Initialize the auto-delete cleanup job for messages and confessions
    const { initCleanupCron } = require('../jobs/cleanup.job');
    initCleanupCron();
};

module.exports = { initCronJobs };
