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
 * Validates only what is necessary to push emails to the queue.
 */
async function initEmailSystem() {
    console.log("🚀 [Email System] Initializing Push-Only Queue Interface...");

    const emailFrom = process.env.EMAIL_FROM;
    if (!emailFrom) {
        throw new Error("❌ [Email System] EMAIL_FROM is not defined in the environment.");
    }

    // Validate EMAIL_FROM format
    try {
        clientModule.sanitizeEmailAddress(emailFrom.includes("<") ? emailFrom.match(/<([^>]+)>/)[1] : emailFrom);
    } catch (err) {
        throw new Error(`❌ [Email System] Invalid email address format in EMAIL_FROM ("${emailFrom}"): ${err.message}`);
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
 * Helper to fetch a template from DB, substitute variables, and wrap in layout.
 * Falls back to null if template not found or error occurs.
 */
async function renderDbTemplate(templateName, variables) {
    try {
        const EmailTemplate = require("../../models/emailTemplate.model");
        const template = await EmailTemplate.findOne({ name: templateName });
        if (!template) return null;

        const platformName = getSetting("platform_name", "Inistnt");
        const supportEmail = getSetting("support_email", "support@inistnt.in");
        const supportPhone = getSetting("support_phone", "+91 70707 99200");
        const companyName = getSetting("company_name", "Inistnt");
        const companyAddress = getSetting("company_address", "Greater Noida");
        const platformDescription = getSetting("platform_description", "College Confession & Dating Platform");
        const dateFormat = getSetting("date_format", "MMM DD, YYYY");
        const defaultCurrency = getSetting("default_currency", "IN");
        const defaultLanguage = getSetting("default_language", "en");
        const timezone = getSetting("timezone", "UTC");

        let content = template.content;
        let subject = template.subject;

        const allVars = {
            ...variables,
            platform_name: platformName,
            support_email: supportEmail,
            support_phone: supportPhone,
            company_name: companyName,
            company_address: companyAddress,
            platform_description: platformDescription,
            date_format: dateFormat,
            default_currency: defaultCurrency,
            default_language: defaultLanguage,
            timezone: timezone
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

        return { subject, htmlBody };
    } catch (err) {
        console.error(`⚠️ Failed to load template '${templateName}' from DB:`, err.message);
        return null;
    }
}

/**
 * Public API 1: sendVerificationEmail(email, code, username)
 * Dispatches a premium verification OTP email.
 */
async function sendVerificationEmail(email, code, username = "") {
    const platformName = getSetting("platform_name", "Inistnt");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const dbTemplate = await renderDbTemplate("otp_verification", {
        otp: code,
        code: code,
        username: cleanUsername
    });

    let subject, htmlBody;
    if (dbTemplate) {
        subject = dbTemplate.subject;
        htmlBody = dbTemplate.htmlBody;
    } else {
        subject = `${code} is your ${platformName} verification code`;
        htmlBody = templatesModule.renderOtpVerification(code, cleanUsername, platformName);
    }

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
 * Public API 2: sendGeneralEmail(to, subject, bodyHtml, text = "", templateName = "general")
 * Dispatches standard HTML emails wrapped in the premium master layout.
 */
async function sendGeneralEmail(to, subject, bodyHtml, text = "", templateName = "general") {
    const platformName = getSetting("platform_name", "Inistnt");
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
    const platformName = getSetting("platform_name", "Inistnt");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const dbTemplate = await renderDbTemplate("welcome_email", {
        username: cleanUsername
    });

    let subject, htmlBody;
    if (dbTemplate) {
        subject = dbTemplate.subject;
        htmlBody = dbTemplate.htmlBody;
    } else {
        subject = `Welcome to ${platformName}! 🎉`;
        htmlBody = templatesModule.renderWelcomeEmail(cleanUsername, platformName);
    }

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
    const platformName = getSetting("platform_name", "Inistnt");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const dbTemplate = await renderDbTemplate("security_alert", {
        username: cleanUsername,
        action: alertDetails.action || "New Account Activity",
        ipAddress: alertDetails.ipAddress || "Unknown IP",
        device: alertDetails.device || "Unknown Device",
        time: alertDetails.time || new Date().toLocaleString()
    });

    let subject, htmlBody;
    if (dbTemplate) {
        subject = dbTemplate.subject;
        htmlBody = dbTemplate.htmlBody;
    } else {
        subject = `🚨 Security Alert for your ${platformName} account`;
        htmlBody = templatesModule.renderSecurityAlert(alertDetails, cleanUsername, platformName);
    }

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
    const platformName = getSetting("platform_name", "Inistnt");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const dbTemplate = await renderDbTemplate("account_approval", {
        username: cleanUsername
    });

    let subject, htmlBody;
    if (dbTemplate) {
        subject = dbTemplate.subject;
        htmlBody = dbTemplate.htmlBody;
    } else {
        subject = `Your ${platformName} account has been approved`;
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
        htmlBody = templatesModule.getMasterLayout(subject, messageContent, platformName);
    }

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
    const platformName = getSetting("platform_name", "Inistnt");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const dbTemplate = await renderDbTemplate("account_rejection", {
        username: cleanUsername,
        reason: reason || "The uploaded college ID card was blurry, expired, or did not match the provided university details."
    });

    let subject, htmlBody;
    if (dbTemplate) {
        subject = dbTemplate.subject;
        htmlBody = dbTemplate.htmlBody;
    } else {
        subject = `Student Verification Update - ${platformName}`;
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
        htmlBody = templatesModule.getMasterLayout(subject, messageContent, platformName);
    }

    return sendEmailAsync({
        to: email,
        subject,
        htmlBody,
        templateName: "account_rejection"
    });
}

/**
 * Public API 7: sendPasswordResetEmail(email, resetUrl, username)
 * Dispatches a password reset email.
 */
async function sendPasswordResetEmail(email, resetUrl, username = "") {
    const platformName = getSetting("platform_name", "Inistnt");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const dbTemplate = await renderDbTemplate("password_reset", {
        url: resetUrl,
        username: cleanUsername
    });

    let subject, htmlBody;
    if (dbTemplate) {
        subject = dbTemplate.subject;
        htmlBody = dbTemplate.htmlBody;
    } else {
        subject = `Reset Your Password - ${platformName}`;
        htmlBody = templatesModule.renderPasswordReset(resetUrl, cleanUsername, platformName);
    }

    return sendEmailAsync({
        to: email,
        subject,
        htmlBody,
        textBody: `Click here to reset your password: ${resetUrl}`,
        templateName: "password_reset"
    });
}

/**
 * Public API 8: sendBillingEmail(email, username, invoiceDetails)
 * Dispatches a premium billing confirmation/receipt email.
 */
async function sendBillingEmail(email, username = "", invoiceDetails = {}) {
    const platformName = getSetting("platform_name", "Inistnt");
    const cleanUsername = clientModule.sanitizeEmailInput(username) || email.split("@")[0];

    const dbTemplate = await renderDbTemplate("billing_receipt", {
        username: cleanUsername,
        planName: invoiceDetails.planName || "Premium Plan",
        amount: invoiceDetails.amount || "0",
        gateway: invoiceDetails.gateway || "stripe",
        transactionId: invoiceDetails.transactionId || "N/A",
        date: invoiceDetails.date || new Date().toLocaleDateString(),
        expiryDate: invoiceDetails.expiryDate || "N/A"
    });

    let subject, htmlBody;
    if (dbTemplate) {
        subject = dbTemplate.subject;
        htmlBody = dbTemplate.htmlBody;
    } else {
        subject = `Billing Receipt: Your ${platformName} Premium subscription is active! 🎉`;
        htmlBody = templatesModule.renderBillingReceipt(invoiceDetails, cleanUsername, platformName);
    }

    return sendEmailAsync({
        to: email,
        subject,
        htmlBody,
        templateName: "billing_receipt"
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
    sendBillingEmail
};
