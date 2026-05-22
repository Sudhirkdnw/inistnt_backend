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

module.exports = {
    sanitizeEmailInput,
    sanitizeEmailAddress
};
