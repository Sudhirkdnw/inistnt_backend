const { redisClient } = require("../../utils/redis");
const EmailLogger = require("./logger");
const clientModule = require("./client");
const { withTimeout, isRetryableError } = require("./retryHandler");
const { getSetting } = require("../../utils/settings");

class EmailQueue {
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

        // Notify peer worker instances via Redis if available
        if (redisClient) {
            redisClient.publish("email:jobs", dbLogId.toString()).catch((err) => {
                console.warn("[Email Queue] Redis publish notification failed:", err.message);
            });
        }

        // Process asynchronously in background
        setImmediate(() => {
            this.processJob(dbLogId).catch(err => {
                console.error(`[Email Queue] Asynchronous dispatch error for job ${dbLogId}:`, err.message);
            });
        });
    }

    /**
     * Process a single queued email transaction
     */
    async processJob(dbLogId) {
        if (!dbLogId) return;
        const EmailLog = require("../../models/emailLog.model");

        try {
            const dbLog = await EmailLog.findById(dbLogId);
            if (!dbLog || dbLog.status === "sent") return;

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

            await EmailLogger.logSent(dbLog, response);
            return response;
        } catch (err) {
            console.error(`❌ [Email Queue] Failed to deliver email for job ${dbLogId}:`, err.message);
            try {
                const dbLog = await EmailLog.findById(dbLogId);
                if (dbLog) {
                    await EmailLogger.logFailed(dbLog, err);
                }
            } catch (dbErr) {
                console.error("[Email Queue] Could not save failed state:", dbErr.message);
            }
            throw err;
        }
    }
}

const emailQueue = new EmailQueue();
module.exports = emailQueue;
