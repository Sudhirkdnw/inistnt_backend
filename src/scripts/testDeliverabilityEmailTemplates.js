const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const nodeEnv = process.env.NODE_ENV || "development";
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const templatesModule = require("../services/email/templates");
const clientModule = require("../services/email/client");
const emailService = require("../services/emailService");
const emailQueue = require("../services/email/queue");
const EmailLog = require("../models/emailLog.model");

async function testDeliverabilityEmailTemplates() {
    console.log("🚀 Testing Email Templates Deliverability & Plain-Text Fallbacks...\n");
    await mongoose.connect(process.env.MONGO_URI);

    try {
        // ── 1. TEST OTP Verification Template ─────────────────
        console.log("▶ TEST 1: OTP Email Template");
        const otpResult = templatesModule.renderOtpVerification("654321", "Aryan", "Hykee");
        console.log(`  • Subject: "${otpResult.subject}"`);
        console.log(`  • Has Plain Text: ${!!otpResult.textBody}`);
        console.log(`  • Plain Text Contains OTP: ${otpResult.textBody.includes("654321")}`);
        console.log(`  • HTML has no linear-gradient: ${!otpResult.htmlBody.includes("linear-gradient")}`);
        console.log(`  • HTML has no external fonts: ${!otpResult.htmlBody.includes("fonts.googleapis.com")}`);

        if (
            otpResult.subject !== "Verify your Hykee email address" ||
            !otpResult.textBody.includes("654321") ||
            otpResult.htmlBody.includes("linear-gradient")
        ) {
            throw new Error("TEST 1 Failed: OTP template does not match deliverability standards.");
        }
        console.log("  ✅ TEST 1 PASSED: OTP email template is ultra-clean & includes plain text.\n");

        // ── 2. TEST Password Reset Template ───────────────────
        console.log("▶ TEST 2: Password Reset Template");
        const resetUrl = "https://hykee.in/reset-password?token=secureToken123";
        const resetResult = templatesModule.renderPasswordReset(resetUrl, "Aryan", "Hykee");
        console.log(`  • Subject: "${resetResult.subject}"`);
        console.log(`  • Has Plain Text: ${!!resetResult.textBody}`);
        console.log(`  • Plain Text Contains URL: ${resetResult.textBody.includes(resetUrl)}`);
        console.log(`  • HTML has clicktracking="off": ${resetResult.htmlBody.includes('clicktracking="off"')}`);

        if (
            resetResult.subject !== "Reset your Hykee password" ||
            !resetResult.textBody.includes(resetUrl) ||
            !resetResult.htmlBody.includes('clicktracking="off"')
        ) {
            throw new Error("TEST 2 Failed: Password reset template does not match deliverability standards.");
        }
        console.log("  ✅ TEST 2 PASSED: Password reset template is minimal and click-tracking disabled.\n");

        // ── 3. TEST Admin Verification Request Template ───────
        console.log("▶ TEST 3: Admin Verification Request Template");
        const adminResult = templatesModule.renderAdminVerificationRequest({
            name: "Rohit Verma",
            email: "rohit.verma@galgotias.ac.in",
            collegeName: "Galgotias University",
            branch: "CSE",
            semester: 6,
            submittedAt: "23/08/2026, 3:30:00 PM"
        }, "https://api.hykee.in/approve", "https://api.hykee.in/reject", "https://admin.hykee.in/verifications", "Hykee");

        console.log(`  • Subject: "${adminResult.subject}"`);
        console.log(`  • Has Plain Text: ${!!adminResult.textBody}`);
        console.log(`  • Plain Text Contains College: ${adminResult.textBody.includes("Galgotias University")}`);
        console.log(`  • Has No Marketing Gimmicks: ${!adminResult.htmlBody.includes("🎉")}`);

        if (!adminResult.textBody.includes("rohit.verma@galgotias.ac.in")) {
            throw new Error("TEST 3 Failed: Admin verification template missing student email in plain text.");
        }
        console.log("  ✅ TEST 3 PASSED: Admin verification email is clean and professional.\n");

        // ── 4. TEST Full Dispatch & Queue Execution ───────────
        console.log("▶ TEST 4: Dispatch & Resend Queue Execution");
        const dispatchRes = await emailService.sendVerificationEmail("test.student@university.ac.in", "998877", "TestStudent");
        console.log(`  • Dispatch Status: ${dispatchRes.status}`);
        console.log(`  • Created Log ID: ${dispatchRes.messageId}`);

        const loggedEmail = await EmailLog.findById(dispatchRes.messageId);
        console.log(`  • Logged Subject: "${loggedEmail.subject}"`);
        console.log(`  • Stored HTML Metadata: ${!!loggedEmail.metadata?.htmlBody}`);
        console.log(`  • Stored Plain-Text Metadata: ${!!loggedEmail.metadata?.textBody}`);
        console.log(`  • Stored Plain-Text Content:\n---\n${loggedEmail.metadata?.textBody}\n---`);

        if (!loggedEmail.metadata?.textBody || !loggedEmail.metadata.textBody.includes("998877")) {
            throw new Error("TEST 4 Failed: Plain text fallback was not stored properly on dispatch.");
        }
        console.log("  ✅ TEST 4 PASSED: Full email dispatch stores both HTML and clean Plain-Text.\n");

        // Clean up test log
        await EmailLog.deleteOne({ _id: dispatchRes.messageId });
        console.log("🧹 Cleaned up test log record.");

        console.log("🎉 ALL DELIVERABILITY & TEMPLATE TESTS PASSED PERFECTLY!");
    } finally {
        await mongoose.disconnect();
    }
}

testDeliverabilityEmailTemplates().catch(err => {
    console.error("❌ Deliverability test error:", err);
    process.exit(1);
});
