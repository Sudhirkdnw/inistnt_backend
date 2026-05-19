const { Resend } = require("resend");

let resendInstance = null;

/**
 * Initializes and returns a singleton instance of the Resend client.
 * Throws an error if the API key is not configured.
 */
function getResendClient() {
    if (resendInstance) return resendInstance;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error("❌ [Email Client] RESEND_API_KEY is not defined in the environment. Enterprise production email requires a valid Resend API key.");
    }

    try {
        resendInstance = new Resend(apiKey);
        return resendInstance;
    } catch (error) {
        throw new Error(`❌ [Email Client] Failed to initialize Resend client: ${error.message}`);
    }
}

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
 * Simple token-bucket rate limiter helper to throttle API calls if needed.
 * Resend free tier has a limit of 10 requests per second.
 */
class RateLimiter {
    constructor(maxRequestsPerSecond = 8) {
        this.tokens = maxRequestsPerSecond;
        this.maxTokens = maxRequestsPerSecond;
        this.lastRefill = Date.now();
        this.queue = [];
    }

    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        if (elapsed > 1000) {
            this.tokens = this.maxTokens;
            this.lastRefill = now;
        }
    }

    async throttle() {
        this.refill();
        if (this.tokens > 0) {
            this.tokens--;
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const waitTime = 1000 - (Date.now() - this.lastRefill);
            setTimeout(async () => {
                await this.throttle();
                resolve();
            }, Math.max(waitTime, 100));
        });
    }
}

const clientLimiter = new RateLimiter(8); // Limit to max 8 req/sec safely

module.exports = {
    getResendClient,
    sanitizeEmailInput,
    sanitizeEmailAddress,
    clientLimiter
};
