const { redisClient } = require("../../utils/redis");

class EmailQueue {
    start() {
        console.log(`⚙️ [Email Queue] Push-only mode initialized.`);
    }

    stop() {
        console.log(`🔌 [Email Queue] Push-only mode halted.`);
    }

    /**
     * Enqueues an email for instant background processing.
     */
    enqueue(dbLogId) {
        if (!dbLogId) return;

        // Notify peer worker instances of the new job
        if (redisClient) {
            redisClient.publish("email:jobs", dbLogId.toString()).catch((err) => {
                console.warn("[Email Queue] Redis publish notification failed:", err.message);
            });
        }
    }
}

const emailQueue = new EmailQueue();
module.exports = emailQueue;
