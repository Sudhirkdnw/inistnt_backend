const { sendGeneralEmail } = require("../services/emailService");
const { getSetting } = require("./settings");

/**
 * Legacy wrapper for sending plain/HTML email.
 * Redirects to the new Resend emailService.
 */
async function sendEmail(to, subject, text, html = null, templateName = null) {
    console.log(`📨 [Legacy Mailer Utility] Forwarding request to Resend email service for: ${to}`);
    // Prioritize HTML, fallback to text if HTML not provided
    const resolvedHtml = html || (text ? text.replace(/\n/g, '<br>') : "");
    return sendGeneralEmail(to, subject, resolvedHtml, text || "", templateName || "legacy");
}

/**
 * Legacy wrapper for template-based email delivery.
 * Fetches the Mongoose template, substitutes variables, and routes through Resend emailService.
 */
async function sendEmailWithTemplate(to, templateName, variables = {}) {
    try {
        const EmailTemplate = require("../models/emailTemplate.model");
        const template = await EmailTemplate.findOne({ name: templateName });

        if (!template) {
            console.warn(`⚠️ legacy sendEmailWithTemplate: Template '${templateName}' not found in database. Falling back to plain text serialization.`);
            const plainText = Object.entries(variables).map(([k, v]) => `${k}: ${v}`).join('\n');
            return sendEmail(to, `Message from ${getSetting('platform_name', 'Inistnt')}`, plainText);
        }

        let html = template.content;
        let subject = template.subject;

        // Substitute placeholders (e.g., {{otp}} or {{username}})
        Object.entries(variables).forEach(([key, val]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            html = html.replace(regex, val);
            subject = subject.replace(regex, val);
        });

        // Substitute platform-wide system variables
        html = html.replace(/{{platform_name}}/g, getSetting('platform_name', 'Inistnt'));
        html = html.replace(/{{support_email}}/g, getSetting('support_email', 'support@inistnt.in'));

        console.log(`📨 [Legacy Mailer Utility] Template '${templateName}' successfully parsed. Transmitting...`);
        return sendGeneralEmail(to, subject, html, null, templateName);
    } catch (error) {
        console.error(`❌ [Legacy Mailer Utility] Error in template-based email delivery:`, error.message);
        throw error;
    }
}

/**
 * Dummy function for backward compatibility with the admin reload page
 */
function refreshTransporter() {
    console.log("🔌 [Legacy Mailer Utility] refreshTransporter invoked: SMTP is discontinued, using Resend API Client.");
    return null;
}

module.exports = {
    sendEmail,
    sendEmailWithTemplate,
    refreshTransporter
};
