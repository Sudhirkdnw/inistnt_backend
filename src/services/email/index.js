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
 * Initializes the backend queue structure.
 */
async function initEmailSystem() {
    const emailFrom = process.env.EMAIL_FROM || getSetting("email_from", "verify@hykee.in");
    if (!emailFrom) {
        throw new Error("❌ [Email System] EMAIL_FROM is not defined in the environment.");
    }

    emailQueue.start();
}

/**
 * Shuts down background queue gracefully.
 */
function shutdownEmailSystem() {
    emailQueue.stop();
}

/**
 * Primary Core Email Dispatcher.
 * 1. Sanitizes inputs.
 * 2. Runs per-recipient abuse rate limiter.
 * 3. Compiles high-deliverability HTML + matching Plain Text content.
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

    // Store HTML & Plain-Text in Mongoose log metadata
    dbLog.metadata = {
        ...dbLog.metadata,
        htmlBody: htmlBody || `<p>${cleanSubject}</p>`,
        textBody: textBody || cleanSubject
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
 * Helper to fetch a template from DB, substitute variables, and wrap in layout.
 * Falls back to null if template not found.
 */
async function renderDbTemplate(templateName, variables) {
    try {
        const EmailTemplate = require("../../models/emailTemplate.model");
        const template = await EmailTemplate.findOne({ name: templateName });
        if (!template) return null;

        const platformName = getSetting("platform_name", "Hykee");
        const supportEmail = getSetting("support_email", "support@hykee.in");

        let content = template.content;
        let subject = template.subject;

        const allVars = {
            ...variables,
            platform_name: platformName,
            support_email: supportEmail
        };

        Object.entries(allVars).forEach(([key, val]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            content = content.replace(regex, typeof val === 'string' ? val : String(val));
            subject = subject.replace(regex, typeof val === 'string' ? val : String(val));
        });

        let htmlBody = content;
        if (!content.includes("<!DOCTYPE html>") && !content.includes("<html>")) {
            htmlBody = templatesModule.getMasterLayout(subject, content, platformName);
        }

        // Clean plain text fallback
        const textBody = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

        return { subject, htmlBody, textBody };
    } catch (err) {
        return null;
    }
}

/**
 * Public API 1: sendVerificationEmail(email, code, username)
 * Dispatches a simple, professional OTP verification email.
 */
async function sendVerificationEmail(email, code, username = "") {
    const platformName = getSetting("platform_name", "Hykee");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const rendered = templatesModule.renderOtpVerification(code, cleanUsername, platformName);

    return sendEmailAsync({
        to: email,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        templateName: "otp_verification"
    });
}

/**
 * Public API 2: sendGeneralEmail(to, subject, bodyHtml, text = "", templateName = "general")
 * Dispatches standard HTML emails wrapped in the clean master layout.
 */
async function sendGeneralEmail(to, subject, bodyHtml, text = "", templateName = "general") {
    const platformName = getSetting("platform_name", "Hykee");
    const cleanSubject = clientModule.sanitizeEmailInput(subject);

    let htmlBody = bodyHtml;
    if (!bodyHtml.includes("<!DOCTYPE html>") && !bodyHtml.includes("<html>")) {
        htmlBody = templatesModule.getMasterLayout(cleanSubject, bodyHtml, platformName);
    }

    const textBody = text || bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    return sendEmailAsync({
        to,
        subject: cleanSubject,
        htmlBody,
        textBody,
        templateName
    });
}

/**
 * Public API 3: sendWelcomeEmail(email, username)
 * Dispatches an account confirmation email upon successful verification.
 */
async function sendWelcomeEmail(email, username = "") {
    const platformName = getSetting("platform_name", "Hykee");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const rendered = templatesModule.renderWelcomeEmail(cleanUsername, platformName);

    return sendEmailAsync({
        to: email,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        templateName: "welcome_email"
    });
}

/**
 * Public API 4: sendSecurityAlert(email, username, alertDetails)
 * Dispatches an urgent security notification.
 */
async function sendSecurityAlert(email, username = "", alertDetails = {}) {
    const platformName = getSetting("platform_name", "Hykee");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const rendered = templatesModule.renderSecurityAlert(alertDetails, cleanUsername, platformName);

    return sendEmailAsync({
        to: email,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        templateName: "security_alert"
    });
}

/**
 * Public API 5: sendApprovalEmail(email, username)
 * Dispatches a student verification approval email.
 */
async function sendApprovalEmail(email, username = "") {
    const platformName = getSetting("platform_name", "Hykee");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const rendered = templatesModule.renderAccountApproval(cleanUsername, platformName);

    return sendEmailAsync({
        to: email,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        templateName: "account_approval"
    });
}

/**
 * Public API 6: sendRejectionEmail(email, username, reason)
 * Dispatches a student verification rejection update email.
 */
async function sendRejectionEmail(email, username = "", reason = "") {
    const platformName = getSetting("platform_name", "Hykee");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const rendered = templatesModule.renderAccountRejection(cleanUsername, reason, platformName);

    return sendEmailAsync({
        to: email,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        templateName: "account_rejection"
    });
}

/**
 * Public API 7: sendPasswordResetEmail(email, resetUrl, username)
 * Dispatches a password reset email.
 */
async function sendPasswordResetEmail(email, resetUrl, username = "") {
    const platformName = getSetting("platform_name", "Hykee");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const rendered = templatesModule.renderPasswordReset(resetUrl, cleanUsername, platformName);

    return sendEmailAsync({
        to: email,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        templateName: "password_reset"
    });
}

/**
 * Public API 8: sendBillingEmail(email, username, invoiceDetails)
 * Dispatches a billing receipt email.
 */
async function sendBillingEmail(email, username = "", invoiceDetails = {}) {
    const platformName = getSetting("platform_name", "Hykee");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const rendered = templatesModule.renderBillingReceipt(invoiceDetails, cleanUsername, platformName);

    return sendEmailAsync({
        to: email,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        templateName: "billing_receipt"
    });
}

/**
 * Public API 9: sendAdminVerificationRequestEmail(adminEmail, studentDetails, approveUrl, rejectUrl, adminPanelUrl)
 * Dispatches a clean notification to the admin with 1-click Approve and Reject buttons.
 */
async function sendAdminVerificationRequestEmail(adminEmail, studentDetails, approveUrl, rejectUrl, adminPanelUrl) {
    const platformName = getSetting("platform_name", "Hykee");
    const rendered = templatesModule.renderAdminVerificationRequest(
        studentDetails,
        approveUrl,
        rejectUrl,
        adminPanelUrl,
        platformName
    );

    return sendEmailAsync({
        to: adminEmail,
        subject: rendered.subject,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        templateName: "admin_verification_request"
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
    sendRejectionEmail,
    sendPasswordResetEmail,
    sendBillingEmail,
    sendAdminVerificationRequestEmail
};
