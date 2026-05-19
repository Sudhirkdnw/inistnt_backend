const crypto = require("crypto");
const EmailLog = require("../../models/emailLog.model");
const clientModule = require("./client");
const templatesModule = require("./templates");
const EmailLogger = require("./logger");
const retryModule = require("./retryHandler");
const { getSetting } = require("../../utils/settings");
const { redisClient } = require("../../utils/redis");

const WORKER_ID = `worker-${crypto.randomBytes(6).toString("hex")}`;
const MAX_ATTEMPTS = 4; // Max delivery attempts (1 primary + 3 retries)

class EmailQueue {
    constructor() {
        this.activeQueue = new Set();
        this.isProcessing = false;
        this.workerInterval = null;
    }

    /**
     * Initializes and starts the background queue worker.
     * Triggers a recovery sweep on start.
     */
    start() {
        console.log(`⚙️ [Email Queue] Background worker [${WORKER_ID}] started.`);
        
        // Run database recovery sweep immediately to pick up any left-over pending jobs
        this.sweepPendingJobs();

        // Periodically sweep the database for stale/unprocessed jobs (every 45 seconds)
        this.workerInterval = setInterval(() => {
            this.sweepPendingJobs();
        }, 45000);

        // Redis subscription coordination if Redis is connected
        if (redisClient) {
            this.setupRedisCoordination();
        }
    }

    /**
     * Gracefully stops the queue worker.
     */
    stop() {
        if (this.workerInterval) {
            clearInterval(this.workerInterval);
            this.workerInterval = null;
        }
        console.log(`🔌 [Email Queue] Background worker [${WORKER_ID}] halted.`);
    }

    /**
     * Enqueues an email for instant background processing.
     * Fires a setImmediate trigger to ensure the main event loop is never blocked.
     */
    enqueue(dbLogId) {
        if (!dbLogId) return;
        
        // Immediate fire-and-forget in next event loop tick
        setImmediate(() => {
            this.processJob(dbLogId).catch((err) => {
                console.error(`[Email Queue] Critical failure processing job ${dbLogId}:`, err.message);
            });
        });

        // If Redis is active, notify peer instances of the new job
        if (redisClient) {
            redisClient.publish("email:jobs", dbLogId.toString()).catch((err) => {
                console.warn("[Email Queue] Redis publish notification failed:", err.message);
            });
        }
    }

    /**
     * Set up real-time Redis subscription to share jobs across horizontal nodes instantly
     */
    setupRedisCoordination() {
        try {
            const { redisSubscriber } = require("../../utils/redis");
            if (redisSubscriber) {
                redisSubscriber.subscribe("email:jobs", (err) => {
                    if (err) console.error("⚠️ [Email Queue] Redis subscription failed:", err.message);
                });

                redisSubscriber.on("message", (channel, dbLogId) => {
                    if (channel === "email:jobs") {
                        // Trigger immediate check in this worker
                        this.processJob(dbLogId).catch(() => {});
                    }
                });
            }
        } catch (err) {
            console.warn("⚠️ [Email Queue] Redis subscriber listener failed:", err.message);
        }
    }

    /**
     * Process a single queued email job by its database log ID.
     * Handles locks, rate limit pacing, mock delivery, timeout protection,
     * and scheduling retries upon failure.
     */
    async processJob(dbLogId) {
        // Prevent double processing in the same worker memory space
        if (this.activeQueue.has(dbLogId.toString())) return;
        this.activeQueue.add(dbLogId.toString());

        let dbLog = null;
        try {
            // Atomic lock query to claim the email horizontally across different cluster nodes/Docker containers
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            
            dbLog = await EmailLog.findOneAndUpdate(
                {
                    _id: dbLogId,
                    status: { $in: ["pending", "retrying"] },
                    $or: [
                        { "metadata.lockedAt": null },
                        { "metadata.lockedAt": { $lt: fiveMinutesAgo } } // Claim stale locks
                    ]
                },
                {
                    $set: {
                        "metadata.lockedAt": new Date(),
                        "metadata.lockedBy": WORKER_ID
                    }
                },
                { returnDocument: 'after' }
            );

            // Job already claimed, processed, or deleted by another node
            if (!dbLog) {
                this.activeQueue.delete(dbLogId.toString());
                return;
            }

            // Update logger status & count attempts
            await EmailLogger.logProcessing(dbLog);

            // Apply global rate limiting before making outbound API calls
            await clientModule.clientLimiter.throttle();

            const resend = clientModule.getResendClient();

            // Prepare dynamic email parameters
            const platformName = getSetting("platform_name", "Social Mini");
            const emailFrom = process.env.EMAIL_FROM || "onboarding@resend.dev";
            const emailReplyTo = process.env.EMAIL_REPLY_TO;
            const resolvedFrom = emailFrom.includes("<") ? emailFrom : `"${platformName}" <${emailFrom}>`;

            const payload = {
                from: resolvedFrom,
                to: [dbLog.to],
                subject: dbLog.subject,
                html: dbLog.metadata?.htmlBody || `<p>${dbLog.subject}</p>`
            };

            if (emailReplyTo) {
                payload.reply_to = emailReplyTo;
            }

            // Run delivery with timeout protection (15 seconds limit)
            const sendPromise = resend.emails.send(payload);
            const response = await retryModule.withTimeout(sendPromise, 15000);

            if (response.error) {
                const errMsg = response.error.message || `Resend Error: ${JSON.stringify(response.error)}`;
                throw new Error(errMsg);
            }

            // Success! Save logs and stats
            await EmailLogger.logSent(dbLog, response);
            
            // Cleanup lock
            await this.releaseLock(dbLog, "sent");

        } catch (error) {
            console.error(`⚠️ [Email Queue] Delivery failed for job <${dbLogId}>:`, error.message);
            
            if (dbLog) {
                await this.handleJobFailure(dbLog, error);
            }
        } finally {
            this.activeQueue.delete(dbLogId.toString());
        }
    }

    /**
     * Handles failures, calculating if retry is safe and scheduling exponential backoffs.
     */
    async handleJobFailure(dbLog, error) {
        const canRetry = retryModule.isRetryableError(error) && dbLog.attempts < MAX_ATTEMPTS;

        if (canRetry) {
            const delayMs = retryModule.calculateBackoffDelay(dbLog.attempts);
            
            // Queue retry update
            await EmailLogger.logRetrying(dbLog, error, delayMs);
            await this.releaseLock(dbLog, "retrying");
            
            // Schedule the job retry in the future
            setTimeout(() => {
                this.enqueue(dbLog._id);
            }, delayMs);
        } else {
            // Exhausted or fatal error -> Move to Dead-Letter Status
            await EmailLogger.logFailed(dbLog, error);
            await this.releaseLock(dbLog, "failed");
        }
    }

    /**
     * Release database lease locks on execution completion
     */
    async releaseLock(dbLog, finalStatus = null) {
        try {
            const updates = {
                "metadata.lockedAt": null,
                "metadata.lockedBy": null
            };
            if (finalStatus) {
                dbLog.status = finalStatus;
            }
            await EmailLog.findByIdAndUpdate(dbLog._id, { $set: updates });
        } catch (err) {
            console.error(`[Email Queue] Failed to release lock on job ${dbLog._id}:`, err.message);
        }
    }

    /**
     * Sweeper Cron Recovery
     * Scans database for pending/retrying emails that are unlocked or have stale locks,
     * and pushes them into processing.
     */
    async sweepPendingJobs() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            
            const staleOrPending = await EmailLog.find({
                status: { $in: ["pending", "retrying"] },
                attempts: { $lt: MAX_ATTEMPTS },
                $or: [
                    { "metadata.lockedAt": null },
                    { "metadata.lockedAt": { $lt: fiveMinutesAgo } }
                ]
            }).limit(20); // Process in batches of 20

            if (staleOrPending.length > 0) {
                console.log(`[Email Queue] Sweeper recovered ${staleOrPending.length} pending email jobs to process.`);
                for (const job of staleOrPending) {
                    this.enqueue(job._id);
                }
            }
        } catch (error) {
            console.error("[Email Queue] Sweeper execution failure:", error.message);
        } finally {
            this.isProcessing = false;
        }
    }
}

// Singleton Queue Instance
const emailQueue = new EmailQueue();

module.exports = emailQueue;
