const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const nodeEnv = process.env.NODE_ENV || "development";
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const EmailTemplate = require("../models/emailTemplate.model");

async function sanitizeDbEmailTemplates() {
    console.log("🚀 Sanitizing MongoDB email templates for maximum deliverability...\n");
    await mongoose.connect(process.env.MONGO_URI);

    try {
        const templates = [
            {
                name: "otp_verification",
                subject: "Verify your {{platform_name}} email address",
                content: `<p>Hi {{username}},</p>
<p>Please use the verification code below to verify your email address and complete your account setup:</p>
<div style="background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; margin: 20px 0; text-align: center;">
    <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111827;">{{otp}}</span>
</div>
<p style="font-size: 13px; color: #6b7280;">This code will expire in 10 minutes.</p>
<p style="font-size: 13px; color: #6b7280;">If you did not request this code, you can safely ignore this email.</p>`,
                variables: ["otp", "code", "username", "platform_name"]
            },
            {
                name: "password_reset",
                subject: "Reset your {{platform_name}} password",
                content: `<p>Hi {{username}},</p>
<p>We received a request to reset your {{platform_name}} password. Click the button below to choose a new password:</p>
<div style="margin: 24px 0;">
    <a href="{{url}}" clicktracking="off" style="background-color: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Reset Password</a>
</div>
<p style="font-size: 13px; color: #6b7280;">This link expires in 20 minutes.</p>
<p style="font-size: 13px; color: #6b7280; word-break: break-all;">
    Or copy and paste this link into your browser:<br>
    <a href="{{url}}" clicktracking="off" style="color: #4f46e5;">{{url}}</a>
</p>
<p style="font-size: 13px; color: #6b7280;">If you did not request a password reset, you can safely ignore this email.</p>`,
                variables: ["url", "username", "platform_name"]
            },
            {
                name: "welcome_email",
                subject: "Your {{platform_name}} account is verified",
                content: `<p>Hi {{username}},</p>
<p>Your email address has been successfully verified. Your {{platform_name}} account is now active.</p>
<p>You can now log in and connect with your college campus community.</p>`,
                variables: ["username", "platform_name"]
            },
            {
                name: "account_approval",
                subject: "Your student verification is approved",
                content: `<p>Hi {{username}},</p>
<p>Your student identity verification has been reviewed and approved.</p>
<p>Your profile now displays the verified campus badge, granting full access to your college feed and communities.</p>`,
                variables: ["username", "platform_name"]
            },
            {
                name: "account_rejection",
                subject: "Hykee verification update",
                content: `<p>Hi {{username}},</p>
<p>We reviewed your student verification request. Unfortunately, we could not verify your student ID card for the following reason:</p>
<div style="background-color: #fef2f2; border-left: 3px solid #ef4444; padding: 12px 16px; margin: 18px 0; font-size: 14px; color: #991b1b;">
    {{reason}}
</div>
<p>You can resubmit a clearer photo of your student ID card directly from your profile settings in the Hykee app.</p>`,
                variables: ["username", "reason", "platform_name"]
            },
            {
                name: "security_alert",
                subject: "Security Alert for your {{platform_name}} account",
                content: `<p>Hi {{username}},</p>
<p>We noticed new activity on your {{platform_name}} account:</p>
<table role="presentation" border="0" cellpadding="6" cellspacing="0" width="100%" style="font-size: 13px; margin: 16px 0; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;">
    <tr><td style="color: #6b7280; width: 30%;">Action:</td><td style="color: #111827; font-weight: 600;">{{action}}</td></tr>
    <tr><td style="color: #6b7280;">IP Address:</td><td style="color: #111827;">{{ipAddress}}</td></tr>
    <tr><td style="color: #6b7280;">Device:</td><td style="color: #111827;">{{device}}</td></tr>
    <tr><td style="color: #6b7280;">Time:</td><td style="color: #111827;">{{time}}</td></tr>
</table>
<p style="font-size: 13px; color: #6b7280;">If this was not you, please reset your password immediately.</p>`,
                variables: ["username", "action", "ipAddress", "device", "time", "platform_name"]
            }
        ];

        for (const t of templates) {
            await EmailTemplate.findOneAndUpdate(
                { name: t.name },
                { $set: t },
                { upsert: true, returnDocument: "after" }
            );
            console.log(`  ✓ Updated template: "${t.name}" -> Subject: "${t.subject}"`);
        }

        console.log("\n✅ All MongoDB Email Templates have been sanitized successfully!");
    } finally {
        await mongoose.disconnect();
    }
}

sanitizeDbEmailTemplates().catch(err => {
    console.error("❌ Error updating templates:", err);
    process.exit(1);
});
