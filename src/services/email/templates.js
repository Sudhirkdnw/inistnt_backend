const { getSetting } = require("../../utils/settings");

/**
 * Ultra-clean, lightweight, high-compatibility Master Layout.
 * Designed specifically for 100% deliverability on strict educational (.ac.in, .edu.in) & corporate spam filters.
 * - System safe typography
 * - High text-to-HTML ratio
 * - No heavy gradients, no external web fonts, no complex CSS animations
 * - Mobile responsive table layout
 */
function getMasterLayout(title, contentHtml, platformName = "Hykee") {
    const supportEmail = getSetting("support_email", "support@hykee.in");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; -webkit-font-smoothing: antialiased;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; padding: 24px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; text-align: left;">
                    <!-- Brand Header -->
                    <tr>
                        <td style="padding: 0 0 20px 0; border-bottom: 1px solid #e5e7eb;">
                            <span style="font-size: 20px; font-weight: 700; color: #111827; letter-spacing: -0.02em;">${platformName}</span>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 24px 0 32px 0; font-size: 15px; line-height: 1.6; color: #374151;">
                            ${contentHtml}
                        </td>
                    </tr>

                    <!-- Minimal Footer -->
                    <tr>
                        <td style="padding: 20px 0 0 0; border-top: 1px solid #e5e7eb; font-size: 12px; line-height: 1.5; color: #6b7280;">
                            <p style="margin: 0 0 4px 0;">Regards,</p>
                            <p style="margin: 0 0 12px 0; font-weight: 600; color: #374151;">${platformName} Team</p>
                            <p style="margin: 0; color: #9ca3af;">
                                <a href="https://hykee.in" style="color: #4f46e5; text-decoration: none;">hykee.in</a> &bull; Support: <a href="mailto:${supportEmail}" style="color: #6b7280; text-decoration: none;">${supportEmail}</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

/**
 * 1. OTP Verification Template
 */
function renderOtpVerification(otp, username, platformName = "Hykee") {
    const subject = "Verify your Hykee email address";
    const name = username || "there";

    const contentHtml = `
        <p style="margin: 0 0 16px 0;">Hi ${name},</p>
        <p style="margin: 0 0 20px 0;">Please use the verification code below to verify your email address and complete your account setup:</p>
        
        <div style="background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin: 20px 0; text-align: center;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111827;">${otp}</span>
        </div>
        
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280;">This code will expire in 10 minutes.</p>
        <p style="margin: 0; font-size: 13px; color: #6b7280;">If you did not request this code, you can safely ignore this email.</p>
    `;

    const textBody = `Hi ${name},

Please use the verification code below to verify your email address and complete your account setup.

YOUR CODE: ${otp}

This code will expire in 10 minutes.

If you did not request this code, you can safely ignore this email.

Regards,
${platformName} Team
hykee.in`;

    return {
        subject,
        htmlBody: getMasterLayout(subject, contentHtml, platformName),
        textBody
    };
}

/**
 * 2. Password Reset Template
 */
function renderPasswordReset(resetUrl, username, platformName = "Hykee") {
    const subject = "Reset your Hykee password";
    const name = username || "there";

    const contentHtml = `
        <p style="margin: 0 0 16px 0;">Hi ${name},</p>
        <p style="margin: 0 0 20px 0;">We received a request to reset your ${platformName} password. Click the button below to choose a new password:</p>
        
        <div style="margin: 24px 0;">
            <a href="${resetUrl}" clicktracking="off" style="background-color: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Reset Password</a>
        </div>
        
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280;">This link expires in 20 minutes.</p>
        <p style="margin: 0 0 16px 0; font-size: 13px; color: #6b7280; word-break: break-all;">
            Or copy and paste this link into your browser:<br>
            <a href="${resetUrl}" clicktracking="off" style="color: #4f46e5;">${resetUrl}</a>
        </p>
        <p style="margin: 0; font-size: 13px; color: #6b7280;">If you did not request a password reset, you can safely ignore this email.</p>
    `;

    const textBody = `Hi ${name},

We received a request to reset your ${platformName} password.

Reset link: ${resetUrl}

This link expires in 20 minutes.

If you did not request a password reset, ignore this email.

— ${platformName} Security
hykee.in`;

    return {
        subject,
        htmlBody: getMasterLayout(subject, contentHtml, platformName),
        textBody
    };
}

/**
 * 3. Welcome / Email Verified Template
 */
function renderWelcomeEmail(username, platformName = "Hykee") {
    const subject = "Your Hykee account is verified";
    const name = username || "there";

    const contentHtml = `
        <p style="margin: 0 0 16px 0;">Hi ${name},</p>
        <p style="margin: 0 0 16px 0;">Your email address has been successfully verified. Your ${platformName} account is now active.</p>
        <p style="margin: 0;">You can now log in and connect with your college campus community.</p>
    `;

    const textBody = `Hi ${name},

Your email address has been successfully verified. Your ${platformName} account is now active.

You can now log in and connect with your college campus community.

Regards,
${platformName} Team
hykee.in`;

    return {
        subject,
        htmlBody: getMasterLayout(subject, contentHtml, platformName),
        textBody
    };
}

/**
 * 4. Account Verification Approved Template
 */
function renderAccountApproval(username, platformName = "Hykee") {
    const subject = "Your student verification is approved";
    const name = username || "there";

    const contentHtml = `
        <p style="margin: 0 0 16px 0;">Hi ${name},</p>
        <p style="margin: 0 0 16px 0;">Your student identity verification has been reviewed and approved.</p>
        <p style="margin: 0;">Your profile now displays the verified campus badge, granting full access to your college feed and communities.</p>
    `;

    const textBody = `Hi ${name},

Your student identity verification has been reviewed and approved.

Your profile now displays the verified campus badge, granting full access to your college feed and communities.

Regards,
${platformName} Team
hykee.in`;

    return {
        subject,
        htmlBody: getMasterLayout(subject, contentHtml, platformName),
        textBody
    };
}

/**
 * 5. Account Verification Rejection Template
 */
function renderAccountRejection(username, reason, platformName = "Hykee") {
    const subject = "Hykee verification update";
    const name = username || "there";
    const finalReason = reason || "The uploaded college ID card was unclear or did not match the submitted details.";

    const contentHtml = `
        <p style="margin: 0 0 16px 0;">Hi ${name},</p>
        <p style="margin: 0 0 16px 0;">We reviewed your student verification request. Unfortunately, we could not verify your student ID card for the following reason:</p>
        
        <div style="background-color: #fef2f2; border-left: 3px solid #ef4444; padding: 12px 16px; margin: 18px 0; font-size: 14px; color: #991b1b;">
            ${finalReason}
        </div>
        
        <p style="margin: 0 0 16px 0;">You can resubmit a clearer photo of your student ID card directly from your profile settings in the Hykee app.</p>
        <p style="margin: 0;">If you have any questions, please feel free to reach out to our support team.</p>
    `;

    const textBody = `Hi ${name},

We reviewed your student verification request. Unfortunately, we could not verify your student ID card for the following reason:

Reason: ${finalReason}

You can resubmit a clearer photo of your student ID card directly from your profile settings in the Hykee app.

Regards,
${platformName} Team
hykee.in`;

    return {
        subject,
        htmlBody: getMasterLayout(subject, contentHtml, platformName),
        textBody
    };
}

/**
 * 6. Security Alert Template
 */
function renderSecurityAlert(alertDetails, username, platformName = "Hykee") {
    const subject = "Security Alert for your Hykee account";
    const name = username || "there";
    const ipAddress = alertDetails.ipAddress || "Unknown IP";
    const device = alertDetails.device || "Unknown Device";
    const time = alertDetails.time || new Date().toLocaleString();
    const action = alertDetails.action || "New login or security activity";

    const contentHtml = `
        <p style="margin: 0 0 16px 0;">Hi ${name},</p>
        <p style="margin: 0 0 18px 0;">We noticed new activity on your ${platformName} account:</p>
        
        <table role="presentation" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 13px; margin: 16px 0; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;">
            <tr>
                <td style="color: #6b7280; width: 30%;">Action:</td>
                <td style="color: #111827; font-weight: 600;">${action}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">IP Address:</td>
                <td style="color: #111827;">${ipAddress}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">Device:</td>
                <td style="color: #111827;">${device}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">Time:</td>
                <td style="color: #111827;">${time}</td>
            </tr>
        </table>
        
        <p style="margin: 0; font-size: 13px; color: #6b7280;">If this was you, you can disregard this email. If you did not perform this action, please reset your password immediately.</p>
    `;

    const textBody = `Hi ${name},

We noticed new activity on your ${platformName} account:

Action: ${action}
IP Address: ${ipAddress}
Device: ${device}
Time: ${time}

If this was you, you can disregard this email. If you did not perform this action, please reset your password immediately.

— ${platformName} Security
hykee.in`;

    return {
        subject,
        htmlBody: getMasterLayout(subject, contentHtml, platformName),
        textBody
    };
}

/**
 * 7. Admin Verification Request Notification Template
 */
function renderAdminVerificationRequest(studentDetails, approveUrl, rejectUrl, adminPanelUrl, platformName = "Hykee") {
    const subject = `New Student Verification Request — ${studentDetails.name || 'Hykee'}`;
    const { name, email, collegeName, branch, semester, submittedAt } = studentDetails;

    const contentHtml = `
        <p style="margin: 0 0 14px 0; font-weight: 600; color: #111827;">A new student verification request is pending review:</p>
        
        <table role="presentation" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 13px; margin: 14px 0; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;">
            <tr>
                <td style="color: #6b7280; width: 30%;">Name:</td>
                <td style="color: #111827; font-weight: 600;">${name || 'N/A'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">Email:</td>
                <td style="color: #111827;">${email || 'N/A'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">College:</td>
                <td style="color: #111827; font-weight: 600;">${collegeName || 'N/A'}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">Branch:</td>
                <td style="color: #111827;">${branch || 'N/A'}</td>
            </tr>
            ${semester ? `
            <tr>
                <td style="color: #6b7280;">Semester:</td>
                <td style="color: #111827;">Semester ${semester}</td>
            </tr>
            ` : ''}
            <tr>
                <td style="color: #6b7280;">Submitted:</td>
                <td style="color: #111827;">${submittedAt || new Date().toLocaleString()}</td>
            </tr>
        </table>
        
        <div style="margin: 24px 0 16px 0;">
            <a href="${approveUrl}" clicktracking="off" style="background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 13px; display: inline-block;">Approve & Verify</a>
            &nbsp;&nbsp;
            <a href="${rejectUrl}" clicktracking="off" style="background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 13px; display: inline-block;">Reject</a>
        </div>
        
        <p style="margin: 0; font-size: 12px; color: #6b7280;">
            <a href="${adminPanelUrl}" style="color: #4f46e5;">View Details in Admin Panel &rarr;</a>
        </p>
    `;

    const textBody = `New Student Verification Request — ${platformName}

A new student verification request is pending.

Name: ${name || 'N/A'}
Email: ${email || 'N/A'}
College: ${collegeName || 'N/A'}
Branch: ${branch || 'N/A'}
Submitted: ${submittedAt || new Date().toLocaleString()}

Approve: ${approveUrl}
Reject: ${rejectUrl}
View in Admin Panel: ${adminPanelUrl}

— ${platformName} Admin System`;

    return {
        subject,
        htmlBody: getMasterLayout(subject, contentHtml, platformName),
        textBody
    };
}

/**
 * 8. Billing Receipt Template
 */
function renderBillingReceipt(invoiceDetails, username, platformName = "Hykee") {
    const subject = "Hykee Premium subscription receipt";
    const name = username || "there";
    const planName = invoiceDetails.planName || "Premium Plan";
    const amount = invoiceDetails.amount || "0";
    const date = invoiceDetails.date || new Date().toLocaleDateString();
    const expiryDate = invoiceDetails.expiryDate || "N/A";

    const contentHtml = `
        <p style="margin: 0 0 16px 0;">Hi ${name},</p>
        <p style="margin: 0 0 16px 0;">Thank you for subscribing to ${platformName} Premium. Here is your receipt:</p>
        
        <table role="presentation" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 13px; margin: 16px 0; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;">
            <tr>
                <td style="color: #6b7280; width: 35%;">Plan:</td>
                <td style="color: #111827; font-weight: 600;">${planName}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">Amount:</td>
                <td style="color: #111827; font-weight: 600;">₹${amount}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">Date:</td>
                <td style="color: #111827;">${date}</td>
            </tr>
            <tr>
                <td style="color: #6b7280;">Valid Until:</td>
                <td style="color: #111827; font-weight: 600;">${expiryDate}</td>
            </tr>
        </table>
    `;

    const textBody = `Hi ${name},

Thank you for subscribing to ${platformName} Premium.

Plan: ${planName}
Amount: ₹${amount}
Date: ${date}
Valid Until: ${expiryDate}

Regards,
${platformName} Team
hykee.in`;

    return {
        subject,
        htmlBody: getMasterLayout(subject, contentHtml, platformName),
        textBody
    };
}

module.exports = {
    getMasterLayout,
    renderOtpVerification,
    renderPasswordReset,
    renderWelcomeEmail,
    renderAccountApproval,
    renderAccountRejection,
    renderSecurityAlert,
    renderAdminVerificationRequest,
    renderBillingReceipt
};
