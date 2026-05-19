/**
 * Advanced Email Retry and Error Handler for Enterprise Resilience.
 * Implements exponential backoff, jitter, timeout protection,
 * and intelligent classification of transient vs fatal errors.
 */

class TimeoutError extends Error {
    constructor(message = "Request timed out") {
        super(message);
        this.name = "TimeoutError";
    }
}

/**
 * Calculates exponential backoff delay with random jitter.
 * Delay formula: base * (factor ^ attempt) + jitter
 */
function calculateBackoffDelay(attempt, baseDelayMs = 2000, maxDelayMs = 30000) {
    const exponential = Math.pow(2, attempt - 1);
    const delay = Math.min(baseDelayMs * exponential, maxDelayMs);
    
    // Add ±20% random jitter to avoid thundering herd problem
    const jitterFactor = 0.8 + Math.random() * 0.4;
    return Math.floor(delay * jitterFactor);
}

/**
 * Wraps a promise in a timeout protection mechanism.
 */
function withTimeout(promise, timeoutMs = 15000) {
    let timeoutId;
    
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new TimeoutError(`Connection timed out after ${timeoutMs / 1000} seconds`));
        }, timeoutMs);
    });

    return Promise.race([
        promise.then((res) => {
            clearTimeout(timeoutId);
            return res;
        }),
        timeoutPromise
    ]);
}

/**
 * Determines whether a delivery error is transient (retryable) or fatal (non-retryable).
 */
function isRetryableError(error) {
    if (!error) return false;
    
    const message = (error.message || "").toLowerCase();
    
    // Non-retryable/Fatal errors (no use in retrying, save resources)
    if (
        message.includes("invalid") ||
        message.includes("validation") ||
        message.includes("unauthorized") ||
        message.includes("api key") ||
        message.includes("missing") ||
        message.includes("parameter") ||
        message.includes("only send testing emails") ||
        message.includes("testing emails to your own email address")
    ) {
        return false;
    }
    
    // Timeout, Rate Limits (429), Network and Server drops (5xx) are retryable
    return (
        error.name === "TimeoutError" ||
        message.includes("429") ||
        message.includes("rate limit") ||
        message.includes("timeout") ||
        message.includes("network") ||
        message.includes("econnreset") ||
        message.includes("econnrefused") ||
        message.includes("etimedout") ||
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504")
    );
}

module.exports = {
    calculateBackoffDelay,
    withTimeout,
    isRetryableError,
    TimeoutError
};
