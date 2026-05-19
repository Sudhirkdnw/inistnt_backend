const clientModule = require("./client");
const templatesModule = require("./templates");
const EmailLogger = require("./logger");
const emailQueue = require("./queue");
const { getSetting } = require("../../utils/settings");

// In-memory rate limiting to prevent spam/abuse per email address (default: max 3 requests in 3 minutes)
const emailRateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const RATE_LIMIT_MAX_REQUESTS = 3;

/**
 * Checks if a recipient email address has exceeded the dispatch rate limit.
 * Cleans the cache periodically to prevent memory leaks.
 */
function isSpamRateLimited(emailAddress) {
    const now = Date.now();

    // Cleanup expired records
    for (const [key, record] of emailRateLimitCache.entries()) {
        if (now - record.firstRequestAt > RATE_LIMIT_WINDOW_MS) {
            emailRateLimitCache.delete(key);
        }
    }

    const record = emailRateLimitCache.get(emailAddress);
    if (!record) {
        emailRateLimitCache.set(emailAddress, {
            count: 1,
            firstRequestAt: now
        });
        return false;
    }

    if (now - record.firstRequestAt > RATE_LIMIT_WINDOW_MS) {
        // Window expired, reset
        emailRateLimitCache.set(emailAddress, {
            count: 1,
            firstRequestAt: now
        });
        return false;
    }

    if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
        return true;
    }

    record.count++;
    return false;
}

/**
 * Initializes the entire enterprise email system and its background queue processor.
 * Performs critical production and development validation checks:
 * 1. Checks that RESEND_API_KEY and EMAIL_FROM are defined.
 * 2. Parses the sender domain.
 * 3. Blocks app startup if the sandbox domain (resend.dev) is detected in production.
 * 4. Verifies that custom sender domains are fully verified in the Resend account.
 */
async function initEmailSystem() {
    console.log("🚀 [Email System] Initializing Enterprise Infrastructure...");

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error("❌ [Email System] RESEND_API_KEY is not defined in the environment. Enterprise production email requires a valid Resend API key.");
    }

    const emailFrom = process.env.EMAIL_FROM;
    if (!emailFrom) {
        throw new Error("❌ [Email System] EMAIL_FROM is not defined in the environment. Enterprise production email requires a valid sender address.");
    }

    // Validate EMAIL_FROM format
    let cleanFrom;
    try {
        cleanFrom = clientModule.sanitizeEmailAddress(emailFrom.includes("<") ? emailFrom.match(/<([^>]+)>/)[1] : emailFrom);
    } catch (err) {
        throw new Error(`❌ [Email System] Invalid email address format in EMAIL_FROM ("${emailFrom}"): ${err.message}`);
    }

    // Validate EMAIL_REPLY_TO if provided
    if (process.env.EMAIL_REPLY_TO) {
        try {
            clientModule.sanitizeEmailAddress(process.env.EMAIL_REPLY_TO);
        } catch (err) {
            throw new Error(`❌ [Email System] Invalid email address format in EMAIL_REPLY_TO ("${process.env.EMAIL_REPLY_TO}"): ${err.message}`);
        }
    }

    // Parse domain
    const domain = cleanFrom.split("@")[1];
    if (!domain) {
        throw new Error(`❌ [Email System] Could not parse domain from EMAIL_FROM: "${emailFrom}"`);
    }

    const isSandboxSender = domain.toLowerCase() === "resend.dev";
    const isProduction = process.env.NODE_ENV === "production";

    if (isSandboxSender) {
        if (isProduction) {
            throw new Error("❌ [Email System] Sandbox sender address (resend.dev) detected in EMAIL_FROM. Production environment blocks app startup for sandbox senders.");
        } else {
            console.warn("⚠️ [Email System] Sandbox sender address (resend.dev) detected. Proceeding in non-production mode.");
        }
    }

    // Retrieve Resend client
    const resend = clientModule.getResendClient();

    // Verify custom domain status in Resend
    if (!isSandboxSender) {
        try {
            const response = await resend.domains.list();
            if (response.error) {
                const errMsg = response.error.message || JSON.stringify(response.error);
                if (errMsg.includes("restricted to only send emails")) {
                    console.log(`⚠️ [Email System] Resend API key is restricted to sending-only mode (recommended for production security).`);
                    console.log(`⚠️ [Email System] Skipping programmatic domain list validation. Please ensure the domain "${domain.toLowerCase()}" is verified on your Resend dashboard.`);
                } else {
                    throw new Error(errMsg);
                }
            } else {
                const domainsList = response.data || [];
                const targetDomain = domain.toLowerCase();
                const matchedDomain = domainsList.find(d => d.name.toLowerCase() === targetDomain);

                if (!matchedDomain) {
                    throw new Error(`Domain "${targetDomain}" is not configured in your Resend account.`);
                }
                if (matchedDomain.status !== "verified") {
                    throw new Error(`Domain "${targetDomain}" is configured in Resend but is not verified (status: "${matchedDomain.status}").`);
                }
                console.log(`✅ [Email System] Verified custom domain "${targetDomain}" detected and validated.`);
            }
        } catch (err) {
            const errMsg = err.message || "";
            if (errMsg.includes("restricted to only send emails")) {
                console.log(`⚠️ [Email System] Resend API key is restricted to sending-only mode (recommended for production security).`);
                console.log(`⚠️ [Email System] Skipping programmatic domain list validation. Please ensure the domain "${domain.toLowerCase()}" is verified on your Resend dashboard.`);
            } else {
                throw new Error(`❌ [Email System] Domain verification failed: ${err.message}`);
            }
        }
    }

    emailQueue.start();
}

/**
 * Shuts down background threads gracefully.
 */
function shutdownEmailSystem() {
    emailQueue.stop();
}

/**
 * Primary Core Email Dispatcher.
 * 1. Sanitizes inputs.
 * 2. Runs per-recipient abuse rate limiter.
 * 3. Compiles high-aesthetic HTML content.
 * 4. Persists the transaction immediately.
 * 5. Pushes to non-blocking background dispatch queue.
 */
async function sendEmailAsync({ to, subject, htmlBody, textBody, templateName }) {
    // 1. Sanitize Inputs
    const cleanTo = clientModule.sanitizeEmailAddress(to);
    const cleanSubject = clientModule.sanitizeEmailInput(subject);

    // 2. Anti-Abuse Rate Limiting
    const enableRateLimiting = getSetting("email_rate_limiting_enabled", true);
    if (enableRateLimiting && isSpamRateLimited(cleanTo)) {
        const rateLimitErr = new Error(`Rate limit exceeded: Too many emails requested for <${cleanTo}>.`);
        rateLimitErr.statusCode = 429;
        throw rateLimitErr;
    }

    // 3. Persist Log Record Immediately in Pending Status
    const dbLog = await EmailLogger.logQueued(cleanTo, cleanSubject, templateName || "general");

    // Store HTML Body in Mongoose log's metadata to pass to the queue processor
    dbLog.metadata = {
        ...dbLog.metadata,
        htmlBody: htmlBody || `<p>${cleanSubject}</p>`
    };
    await dbLog.save();

    // 4. Push to non-blocking background queue
    emailQueue.enqueue(dbLog._id);

    return {
        success: true,
        messageId: dbLog._id.toString(),
        status: "queued"
    };
}

/**
 * Public API 1: sendVerificationEmail(email, code, username)
 * Dispatches a premium verification OTP email.
 */
async function sendVerificationEmail(email, code, username = "") {
    const platformName = getSetting("platform_name", "Social Mini");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const subject = `${code} is your ${platformName} verification code`;
    const htmlBody = templatesModule.renderOtpVerification(code, cleanUsername, platformName);
    const textBody = `Welcome to ${platformName}! Use verification code ${code} to verify your email address.`;

    return sendEmailAsync({
        to: email,
        subject,
        htmlBody,
        textBody,
        templateName: "otp_verification"
    });
}

/**
 * Public API 2: sendGeneralEmail(to, subject, bodyHtml, text)
 * Dispatches standard HTML emails wrapped in the premium master layout.
 */
async function sendGeneralEmail(to, subject, bodyHtml, text = "", templateName = "general") {
    const platformName = getSetting("platform_name", "Social Mini");
    const cleanSubject = clientModule.sanitizeEmailInput(subject);

    let htmlBody = bodyHtml;
    // Wrap in Master Layout if not already a fully formed document
    if (!bodyHtml.includes("<!DOCTYPE html>") && !bodyHtml.includes("<html>")) {
        htmlBody = templatesModule.getMasterLayout(cleanSubject, bodyHtml, platformName);
    }

    return sendEmailAsync({
        to,
        subject: cleanSubject,
        htmlBody,
        textBody: text,
        templateName
    });
}

/**
 * Public API 3: sendWelcomeEmail(email, username)
 * Dispatches a premium welcome email upon successful verification.
 */
async function sendWelcomeEmail(email, username = "") {
    const platformName = getSetting("platform_name", "Social Mini");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const subject = `Welcome to ${platformName}! 🎉`;
    const htmlBody = templatesModule.renderWelcomeEmail(cleanUsername, platformName);

    return sendEmailAsync({
        to: email,
        subject,
        htmlBody,
        templateName: "welcome_email"
    });
}

/**
 * Public API 4: sendSecurityAlert(email, username, alertDetails)
 * Dispatches an urgent security notification.
 */
async function sendSecurityAlert(email, username = "", alertDetails = {}) {
    const platformName = getSetting("platform_name", "Social Mini");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const subject = `🚨 Security Alert for your ${platformName} account`;
    const htmlBody = templatesModule.renderSecurityAlert(alertDetails, cleanUsername, platformName);

    return sendEmailAsync({
        to: email,
        subject,
        htmlBody,
        templateName: "security_alert"
    });
}

/**
 * Public API 5: sendApprovalEmail(email, username)
 * Dispatches an account approval email to the verified student.
 */
async function sendApprovalEmail(email, username = "") {
    const platformName = getSetting("platform_name", "Zynk");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const subject = `Your ${platformName} account has been approved`;
    const messageContent = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <p>Dear ${cleanUsername},</p>
            <p>Your student identity has been verified successfully. You can now access ${platformName}.</p>
            <p>Feel free to log in and start connecting with your fellow college peers right away!</p>
            <div style="margin: 25px 0;">
                <a href="${process.env.CLIENT_URL}/login" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Get Started</a>
            </div>
            <p>Best regards,<br>The ${platformName} Support Team</p>
        </div>
    `;
    const htmlBody = templatesModule.getMasterLayout(subject, messageContent, platformName);

    return sendEmailAsync({
        to: email,
        subject,
        htmlBody,
        templateName: "account_approval"
    });
}

/**
 * Public API 6: sendRejectionEmail(email, username, reason)
 * Dispatches a polite account rejection email.
 */
async function sendRejectionEmail(email, username = "", reason = "") {
    const platformName = getSetting("platform_name", "Zynk");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const subject = `Student Verification Update - ${platformName}`;
    const messageContent = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <p>Dear ${cleanUsername},</p>
            <p>Thank you for your interest in joining ${platformName}. We have reviewed the college ID card verification you provided.</p>
            <p>Unfortunately, your verification could not be approved at this time for the following reason:</p>
            <div style="background-color: #FEE2E2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0; border-radius: 4px; color: #991B1B;">
                <strong>Reason:</strong> ${reason || "The uploaded college ID card was blurry, expired, or did not match the provided university details."}
            </div>
            <p>If you believe this was an error, please sign up again with a clearer picture of your student ID card or try verifying using a valid college email address.</p>
            <p>Best regards,<br>The ${platformName} Team</p>
        </div>
    `;
    const htmlBody = templatesModule.getMasterLayout(subject, messageContent, platformName);

    return sendEmailAsync({
        to: email,
        subject,
        htmlBody,
        templateName: "account_rejection"
    });
}

module.exports = {
    initEmailSystem,
    shutdownEmailSystem,
    sendEmailAsync,
    sendVerificationEmail,
    sendGeneralEmail,
    sendWelcomeEmail,
    sendSecurityAlert,
    sendApprovalEmail,
    sendRejectionEmail
};
