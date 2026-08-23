const axios = require("axios");
const { getSetting } = require("../../utils/settings");

/**
 * Sanitizes input fields to prevent header injection, script injections, and email abuse.
 */
function sanitizeEmailInput(input) {
    if (!input || typeof input !== "string") return "";
    
    // Remove control characters, newlines, and carriage returns to prevent SMTP header injection
    let sanitized = input.replace(/[\r\n\t]/g, "").trim();
    
    // Basic HTML tag stripping for subjects/recipients
    sanitized = sanitized.replace(/<[^>]*>/g, "");
    
    return sanitized;
}

/**
 * Sanitizes email address inputs specifically.
 */
function sanitizeEmailAddress(email) {
    if (!email || typeof email !== "string") return "";
    let sanitized = email.replace(/[\s\r\n\t]/g, "").trim().toLowerCase();
    
    // Ensure it looks like a valid email address structure
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitized)) {
        throw new Error(`Invalid email address format: "${email}"`);
    }
    
    return sanitized;
}

/**
 * Factory that returns a unified Resend client interface.
 */
function getResendClient() {
    const apiKey = getSetting("resend_api_key", "") || process.env.RESEND_API_KEY || "";

    return {
        emails: {
            send: async (payload) => {
                if (!apiKey) {
                    console.warn("⚠️ [Email System] RESEND_API_KEY is not configured in environment or settings. Simulating dispatch.");
                    return { data: { id: `mock-${Date.now()}` } };
                }

                const response = await axios.post("https://api.resend.com/emails", payload, {
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    }
                });

                return response.data;
            }
        }
    };
}

module.exports = {
    sanitizeEmailInput,
    sanitizeEmailAddress,
    getResendClient
};
