const { redisClient } = require("../../utils/redis");
const EmailLogger = require("./logger");
const clientModule = require("./client");
const { withTimeout, isRetryableError } = require("./retryHandler");
const { getSetting } = require("../../utils/settings");

class EmailQueue {
    constructor() {
        this.activeJobs = new Set();
    }

    start() {
        console.log(`⚙️ [Email Queue] Push & Local Dispatch mode initialized.`);
    }

    stop() {
        console.log(`🔌 [Email Queue] Email Queue stopped.`);
    }

    /**
     * Enqueues an email for instant background processing.
     */
    enqueue(dbLogId) {
        if (!dbLogId) return;

        const idStr = dbLogId.toString();

        // Notify peer worker instances via Redis if available
        if (redisClient) {
            redisClient.publish("email:jobs", idStr).catch((err) => {
                console.warn("[Email Queue] Redis publish notification failed:", err.message);
            });
        }

        // Process asynchronously in background
        setImmediate(() => {
            this.processJob(dbLogId).catch(err => {
                console.error(`[Email Queue] Asynchronous dispatch error for job ${idStr}:`, err.message);
            });
        });
    }

    /**
     * Process a single queued email transaction atomically
     */
    async processJob(dbLogId) {
        if (!dbLogId) return;
        const idStr = dbLogId.toString();
        if (this.activeJobs.has(idStr)) return;
        this.activeJobs.add(idStr);

        const EmailLog = require("../../models/emailLog.model");

        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

            // Atomic lock to guarantee only one process/worker sends the email
            const dbLog = await EmailLog.findOneAndUpdate(
                {
                    _id: dbLogId,
                    status: { $in: ["pending", "retrying"] },
                    $or: [
                        { "metadata.lockedAt": null },
                        { "metadata.lockedAt": { $lt: fiveMinutesAgo } }
                    ]
                },
                {
                    $set: {
                        status: "processing",
                        "metadata.lockedAt": new Date(),
                        "metadata.lockedBy": `backend-${process.pid}`
                    }
                },
                { new: true }
            );

            if (!dbLog) {
                // Job was already claimed or sent by another worker/thread
                return;
            }

            await EmailLogger.logProcessing(dbLog);

            // Format sender identity
            const emailFromName = getSetting("email_from_name", "Hykee") || "Hykee";
            const emailFromAddress = process.env.EMAIL_FROM || getSetting("email_from", "verify@hykee.in");
            let formattedFrom = emailFromAddress;

            if (!formattedFrom.includes("<") && emailFromName) {
                formattedFrom = `${emailFromName} <${emailFromAddress}>`;
            }

            const supportEmail = getSetting("support_email", "support@hykee.in");

            const payload = {
                from: formattedFrom,
                to: [dbLog.to],
                subject: dbLog.subject,
                html: dbLog.metadata?.htmlBody || `<p>${dbLog.subject}</p>`,
                text: dbLog.metadata?.textBody || "",
                reply_to: supportEmail,
                headers: {
                    "X-Entity-Ref-ID": dbLog._id.toString()
                },
                tags: [
                    { name: "category", value: dbLog.template || "transactional" }
                ]
            };

            const resendClient = clientModule.getResendClient();
            const response = await withTimeout(resendClient.emails.send(payload), 15000);

            if (response.error) {
                throw new Error(response.error.message || `Resend Error: ${JSON.stringify(response.error)}`);
            }

            dbLog.status = "sent";
            dbLog.sentAt = new Date();
            dbLog.metadata.lockedAt = null;
            dbLog.metadata.lockedBy = null;
            await EmailLogger.logSent(dbLog, response);
            return response;
        } catch (err) {
            console.error(`❌ [Email Queue] Failed to deliver email for job ${dbLogId}:`, err.message);
            try {
                const dbLog = await EmailLog.findById(dbLogId);
                if (dbLog) {
                    dbLog.metadata = dbLog.metadata || {};
                    dbLog.metadata.lockedAt = null;
                    dbLog.metadata.lockedBy = null;
                    await EmailLogger.logFailed(dbLog, err);
                }
            } catch (dbErr) {
                console.error("[Email Queue] Could not save failed state:", dbErr.message);
            }
            throw err;
        } finally {
            this.activeJobs.delete(idStr);
        }
    }
}

const emailQueue = new EmailQueue();
module.exports = emailQueue;

