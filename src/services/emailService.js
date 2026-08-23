/**
 * Unified Email Service Orchestrator (Enterprise Grade)
 * 
 * Re-exports the API from the new modular email system under src/services/email/.
 * Maintains 100% backward compatibility with all existing controller files and utilities.
 */

const emailSystem = require("./email");

module.exports = {
    // Core Email Delivery API (fully backward compatible)
    sendVerificationEmail: emailSystem.sendVerificationEmail,
    sendGeneralEmail: emailSystem.sendGeneralEmail,
    
    // Enterprise Email Systems Additions
    sendWelcomeEmail: emailSystem.sendWelcomeEmail,
    sendSecurityAlert: emailSystem.sendSecurityAlert,
    sendEmailAsync: emailSystem.sendEmailAsync,
    sendApprovalEmail: emailSystem.sendApprovalEmail,
    sendRejectionEmail: emailSystem.sendRejectionEmail,
    sendPasswordResetEmail: emailSystem.sendPasswordResetEmail,
    sendAdminVerificationRequestEmail: emailSystem.sendAdminVerificationRequestEmail,

    // Lifecycle Hooks
    initEmailSystem: emailSystem.initEmailSystem,
    shutdownEmailSystem: emailSystem.shutdownEmailSystem
};
