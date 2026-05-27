const { EmailLog } = require("@social-mini/shared-models");
const InfrastructureLogger = require("../../utils/infrastructureLogger");

/**
 * Structured logger to capture transactional email states, database logging,
 * and precise delivery performance/latency analytics.
 */
class EmailLogger {
    /**
     * Log and save an email when it gets queued in the database/worker queue.
     */
    static async logQueued(to, subject, templateName) {
        try {
            const dbLog = new EmailLog({
                to,
                subject,
                template: templateName || "general",
                status: "pending",
                attempts: 0,
                metadata: {
                    queuedAt: new Date()
                }
            });
            await dbLog.save();
            
            InfrastructureLogger.email("INFO", `Queued email to <${to}> using template "${templateName}" for delivery.`, {
                dbLogId: dbLog._id,
                subject
            }, "pending");

            return dbLog;
        } catch (error) {
            console.error(`[Email System] ⚠️ Failed to write queued log for <${to}>:`, error.message);
            // Return transient log object to avoid crashing the thread
            return new EmailLog({ to, subject, template: templateName, status: "pending", attempts: 0 });
        }
    }

    /**
     * Log when the background worker picks up the email for processing.
     */
    static async logProcessing(dbLog) {
        try {
            dbLog.status = "pending"; // kept in database as pending during execution
            dbLog.attempts = (dbLog.attempts || 0) + 1;
            
            if (!dbLog.metadata) dbLog.metadata = {};
            dbLog.metadata.processingStartedAt = new Date();
            
            await dbLog.save();
            
            InfrastructureLogger.email("INFO", `Attempt #${dbLog.attempts}: Background worker processing email to <${dbLog.to}>.`, {
                dbLogId: dbLog._id,
                attempts: dbLog.attempts
            }, "processing");
        } catch (error) {
            console.error(`[Email System] ⚠️ Failed to update processing state:`, error.message);
        }
    }

    /**
     * Log when the email is successfully delivered through Resend.
     */
    static async logSent(dbLog, response) {
        try {
            const now = new Date();
            dbLog.status = "sent";
            dbLog.sentAt = now;
            
            if (!dbLog.metadata) dbLog.metadata = {};
            dbLog.metadata.sentAt = now;
            
            // Calculate latency metrics
            const queuedAt = dbLog.metadata.queuedAt ? new Date(dbLog.metadata.queuedAt) : dbLog.createdAt;
            const startedAt = dbLog.metadata.processingStartedAt ? new Date(dbLog.metadata.processingStartedAt) : null;
            
            const queueLatencyMs = queuedAt ? (now - queuedAt) : 0;
            const apiLatencyMs = startedAt ? (now - startedAt) : 0;
            
            dbLog.metadata.queueLatencyMs = queueLatencyMs;
            dbLog.metadata.apiLatencyMs = apiLatencyMs;
            
            if (response) {
                dbLog.metadata.resendResponse = response;
            }
            
            await dbLog.save();
            
            const responseId = response?.data?.id || response?.id || 'UNKNOWN';
            
            InfrastructureLogger.email("SUCCESS", `Email successfully sent to <${dbLog.to}>. Resend ID: ${responseId}`, {
                dbLogId: dbLog._id,
                resendId: responseId,
                attempts: dbLog.attempts,
                queueLatencyMs,
                apiLatencyMs
            }, "sent");
        } catch (error) {
            console.error(`[Email System] ⚠️ Failed to record successful delivery for <${dbLog.to}>:`, error.message);
        }
    }

    /**
     * Log when an email retry is scheduled.
     */
    static async logRetrying(dbLog, error, delayMs) {
        try {
            if (!dbLog.metadata) dbLog.metadata = {};
            if (!dbLog.metadata.retries) dbLog.metadata.retries = [];
            
            dbLog.metadata.retries.push({
                attempt: dbLog.attempts,
                error: error.message,
                timestamp: new Date()
            });
            
            await dbLog.save();
            
            InfrastructureLogger.email("WARNING", `Attempt #${dbLog.attempts} failed to deliver email to <${dbLog.to}>. Retrying in ${delayMs / 1000}s. Error: ${error.message}`, {
                dbLogId: dbLog._id,
                attempts: dbLog.attempts,
                error: error.message,
                nextRetryInMs: delayMs
            }, "retrying");
        } catch (dbErr) {
            console.error(`[Email System] ⚠️ Failed to log retrying state:`, dbErr.message);
        }
    }

    /**
     * Log when the email permanently fails all retries.
     * Pushes to Dead-Letter Status.
     */
    static async logFailed(dbLog, error) {
        try {
            dbLog.status = "failed";
            dbLog.error = error.message;
            
            if (!dbLog.metadata) dbLog.metadata = {};
            dbLog.metadata.failedAt = new Date();
            dbLog.metadata.permanentError = error.message;
            dbLog.metadata.isDeadLetter = true;
            
            await dbLog.save();
            
            InfrastructureLogger.email("CRITICAL", `Email to <${dbLog.to}> permanently failed after ${dbLog.attempts} attempts. Error: "${error.message}". Stored in Dead-Letter Queue (DLQ).`, {
                dbLogId: dbLog._id,
                attempts: dbLog.attempts,
                error: error.message,
                isDeadLetter: true
            }, "failed");
        } catch (dbErr) {
            console.error(`[Email System] ⚠️ Failed to record permanent failure for <${dbLog.to}>:`, dbErr.message);
        }
    }
}

module.exports = EmailLogger;
