const { getSetting } = require("../../utils/settings");

/**
 * Premium master layout that wraps all transactional emails.
 * Uses sleek modern CSS, Inter typography, elegant shadows, and gradient headers.
 */
function getMasterLayout(title, contentHtml, platformName) {
    const currentYear = new Date().getFullYear();
    const supportEmail = getSetting("support_email", "support@hykee.in");

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                background-color: #f8fafc;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #1e293b;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            .wrapper {
                width: 100%;
                background-color: #f8fafc;
                padding: 40px 0;
            }
            .container {
                max-width: 580px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 20px;
                overflow: hidden;
                box-shadow: 0 10px 30px -5px rgba(79, 70, 229, 0.05), 0 8px 15px -6px rgba(0, 0, 0, 0.03);
                border: 1px solid #e2e8f0;
            }
            .header {
                background: linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%);
                padding: 48px 32px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                color: #ffffff;
                font-size: 26px;
                font-weight: 800;
                letter-spacing: -0.03em;
            }
            .header p {
                margin: 8px 0 0 0;
                color: #e0e7ff;
                font-size: 14px;
                font-weight: 500;
            }
            .content {
                padding: 44px 36px;
            }
            .greeting {
                font-size: 16px;
                font-weight: 700;
                margin-top: 0;
                margin-bottom: 12px;
                color: #0f172a;
            }
            .text {
                font-size: 15px;
                line-height: 1.6;
                color: #475569;
                margin-bottom: 24px;
            }
            .highlight-card {
                background-color: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                padding: 24px;
                margin: 28px 0;
                text-align: center;
            }
            .highlight-value {
                font-family: 'Courier New', Courier, monospace;
                font-size: 36px;
                font-weight: 800;
                letter-spacing: 0.18em;
                color: #4f46e5;
                margin: 0;
                text-shadow: 0 2px 4px rgba(79, 70, 229, 0.08);
            }
            .highlight-label {
                font-size: 12px;
                color: #94a3b8;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-top: 8px;
            }
            .btn-container {
                text-align: center;
                margin: 32px 0;
            }
            .btn {
                display: inline-block;
                background-color: #4f46e5;
                color: #ffffff !important;
                font-weight: 700;
                font-size: 15px;
                text-decoration: none !important;
                padding: 14px 36px;
                border-radius: 12px;
                box-shadow: 0 4px 12px -2px rgba(79, 70, 229, 0.25);
                transition: all 0.2s ease;
            }
            .btn:hover {
                background-color: #4338ca;
                transform: translateY(-1px);
            }
            .info-table {
                width: 100%;
                border-collapse: collapse;
                margin: 24px 0;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                overflow: hidden;
            }
            .info-table td {
                padding: 12px 16px;
                font-size: 14px;
                border-bottom: 1px solid #e2e8f0;
            }
            .info-table td.label {
                color: #64748b;
                font-weight: 600;
                width: 35%;
                background-color: #f8fafc;
            }
            .info-table td.value {
                color: #334155;
            }
            .signature {
                margin-top: 36px;
                font-size: 15px;
                color: #475569;
                border-top: 1px solid #f1f5f9;
                padding-top: 24px;
            }
            .signature strong {
                color: #0f172a;
            }
            .footer {
                padding: 0 36px 44px 36px;
                text-align: center;
            }
            .footer-text {
                font-size: 12px;
                color: #94a3b8;
                line-height: 1.6;
                margin: 0;
            }
            .footer-text a {
                color: #6366f1;
                text-decoration: none;
            }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                <div class="header">
                    <h1>${platformName}</h1>
                    <p>Connecting Campuses. Seamlessly.</p>
                </div>
                <div class="content">
                    ${contentHtml}
                    
                    <div class="signature">
                        Cheers,<br>
                        <strong>The ${platformName} Team</strong>
                    </div>
                </div>
                <div class="footer">
                    <p class="footer-text">
                        This is an automated transmission from a secure system.<br>
                        Please do not reply directly to this email.<br><br>
                        Need assistance? Contact <a href="mailto:${supportEmail}">${supportEmail}</a><br>
                        &copy; ${currentYear} ${platformName}. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

/**
 * 1. OTP Verification Template
 */
function renderOtpVerification(otp, username, platformName) {
    const content = `
        <p class="greeting">Hi ${username},</p>
        <p class="text">
            Welcome to <strong>${platformName}</strong>! Please verify your email address to complete your registration. Use the secure 6-digit verification code below:
        </p>
        
        <div class="highlight-card">
            <p class="highlight-value">${otp}</p>
            <p class="highlight-label">Temporary Access Token</p>
        </div>
        
        <p class="text" style="font-size: 13px; color: #94a3b8; text-align: center; margin-top: -10px;">
            ⚠️ This code is strictly confidential and expires in <strong>10 minutes</strong>.
        </p>
        
        <p class="text">
            If you did not initiate this request, someone may have typed your address by mistake. You can safely ignore this alert.
        </p>
    `;
    return getMasterLayout(`Verify Your Email - ${platformName}`, content, platformName);
}

/**
 * 2. Password Reset Template
 */
function renderPasswordReset(resetUrl, username, platformName) {
    const content = `
        <p class="greeting">Hello ${username},</p>
        <p class="text">
            We received a request to securely reset your password for your <strong>${platformName}</strong> account. Please click the button below to complete the process:
        </p>
        
        <div class="btn-container">
            <a href="${resetUrl}" class="btn" target="_blank">Reset My Password</a>
        </div>
        
        <p class="text" style="font-size: 13px; color: #94a3b8; text-align: center;">
            ⚠️ This secure reset link is valid for <strong>20 minutes</strong>.
        </p>
        
        <p class="text" style="font-size: 13px; color: #64748b; background-color: #f1f5f9; padding: 12px; border-radius: 8px;">
            If you're having trouble clicking the button, copy and paste the URL below into your browser:<br>
            <a href="${resetUrl}" style="color: #4f46e5; word-break: break-all;">${resetUrl}</a>
        </p>
        
        <p class="text">
            If you did not request a password change, please ignore this email; your credentials will remain safe and unaltered.
        </p>
    `;
    return getMasterLayout(`Reset Your Password - ${platformName}`, content, platformName);
}

/**
 * 3. Welcome Email Template
 */
function renderWelcomeEmail(username, platformName) {
    const content = `
        <p class="greeting">Welcome to the Club, ${username}! 🎉</p>
        <p class="text">
            Your account is now fully verified and activated! We are thrilled to have you join <strong>${platformName}</strong> — the ultimate social environment for your campus.
        </p>
        
        <p class="text">
            Here's what you can do right away to get started:
        </p>
        
        <ul class="text" style="padding-left: 20px; line-height: 1.8;">
            <li>📝 <strong>Share Confessions</strong> anonymously or with your handle.</li>
            <li>💬 <strong>Engage</strong> on interesting threads with fellow students.</li>
            <li>💖 <strong>Explore Dating</strong> to match up with matches around your campus.</li>
            <li>🔒 <strong>Safety First</strong>: Real-time moderation protects your privacy.</li>
        </ul>
        
        <div class="btn-container" style="margin-top: 36px;">
            <a href="${getSetting("client_url")}" class="btn" target="_blank">Enter Platform</a>
        </div>
        
        <p class="text">
            If you have any feedback or ideas to share, just send us an email. Our team is always eager to listen!
        </p>
    `;
    return getMasterLayout(`Welcome to ${platformName}!`, content, platformName);
}

/**
 * 4. Security Alert Template
 */
function renderSecurityAlert(alertDetails, username, platformName) {
    const ipAddress = alertDetails.ipAddress || "Unknown IP";
    const device = alertDetails.device || "Unknown Device";
    const time = alertDetails.time || new Date().toLocaleString();
    const action = alertDetails.action || "New Account Activity";

    const content = `
        <p class="greeting">Security Alert: Action Required</p>
        <p class="text">
            Hi ${username}, we detected some critical activity or a login attempt on your <strong>${platformName}</strong> account. Please review the transaction details below:
        </p>
        
        <table class="info-table">
            <tr>
                <td class="label">Trigger Action</td>
                <td class="value"><strong>${action}</strong></td>
            </tr>
            <tr>
                <td class="label">IP Address</td>
                <td class="value"><code>${ipAddress}</code></td>
            </tr>
            <tr>
                <td class="label">Device/OS</td>
                <td class="value">${device}</td>
            </tr>
            <tr>
                <td class="label">Date & Time</td>
                <td class="value">${time}</td>
            </tr>
        </table>
        
        <p class="text" style="color: #b91c1c; font-weight: 600;">
            🚩 If this was not you, your account credentials might have been compromised!
        </p>
        
        <p class="text">
            We highly recommend changing your password immediately and securing your collegiate email. You can trigger a password recovery sequence directly from the login page.
        </p>
        
        <div class="btn-container">
            <a href="${getSetting("client_url")}/forgot-password" class="btn" style="background-color: #dc2626;" target="_blank">Secure My Account</a>
        </div>
    `;
    return getMasterLayout(`Security Notification - ${platformName}`, content, platformName);
}

/**
 * 5. Billing Receipt Template
 */
function renderBillingReceipt(invoiceDetails, username, platformName) {
    const planName = invoiceDetails.planName || "Premium Plan";
    const amount = invoiceDetails.amount || "0";
    const gateway = invoiceDetails.gateway || "Stripe";
    const transactionId = invoiceDetails.transactionId || "N/A";
    const date = invoiceDetails.date || new Date().toLocaleDateString();
    const expiryDate = invoiceDetails.expiryDate || "N/A";

    const content = `
        <p class="greeting">Hi ${username},</p>
        <p class="text">
            Thank you for upgrading to <strong>${platformName} Premium</strong>! Your payment has been processed successfully. Below is your billing confirmation receipt:
        </p>
        
        <table class="info-table">
            <tr>
                <td class="label">Product</td>
                <td class="value"><strong>${platformName} Premium - ${planName}</strong></td>
            </tr>
            <tr>
                <td class="label">Amount Paid</td>
                <td class="value"><strong>₹${amount}</strong></td>
            </tr>
            <tr>
                <td class="label">Payment Gateway</td>
                <td class="value" style="text-transform: capitalize;">${gateway}</td>
            </tr>
            <tr>
                <td class="label">Transaction ID</td>
                <td class="value"><code>${transactionId}</code></td>
            </tr>
            <tr>
                <td class="label">Date</td>
                <td class="value">${date}</td>
            </tr>
            <tr>
                <td class="label">Access Valid Until</td>
                <td class="value"><strong>${expiryDate}</strong></td>
            </tr>
        </table>
        
        <div class="highlight-card" style="margin-top: 24px; padding: 16px;">
            <p style="margin: 0; color: #4f46e5; font-size: 16px; font-weight: 700;">🎉 Premium Benefits Activated!</p>
            <p style="margin: 8px 0 0 0; color: #64748b; font-size: 13px;">You now have complete access to campus discovery, crush matching, private photo reveal controls, and more.</p>
        </div>

        <p class="text">
            If you have any questions about this charge or your subscription, please don't hesitate to reach out to our support team.
        </p>
    `;
    return getMasterLayout(`Billing Receipt - ${platformName} Premium`, content, platformName);
}

module.exports = {
    renderOtpVerification,
    renderPasswordReset,
    renderWelcomeEmail,
    renderSecurityAlert,
    renderBillingReceipt,
    getMasterLayout
};
