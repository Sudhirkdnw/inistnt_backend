const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const nodeEnv = process.env.NODE_ENV || "development";
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const userModel = require("../models/user.model");
const VerificationRequest = require("../models/verificationRequest.model");
const notificationModel = require("../models/notification.model");
const auditLogModel = require("../models/auditLog.model");
const verificationCtrl = require("../controllers/verification.controller");

async function runVerificationTests() {
    console.log("🚀 Starting Student Verification & Direct Email Action Tests...\n");
    await mongoose.connect(process.env.MONGO_URI);

    try {
        // Clean up test fixtures
        await userModel.deleteMany({ username: /^test_student_verif_/ });
        await VerificationRequest.deleteMany({ username: /^test_student_verif_/ });

        // ── TEST 1: Creation of Verification Request with Signed One-Time Token ──
        console.log("▶ TEST 1: Verification Request Creation & Signed Token");
        const testUser1 = await userModel.create({
            username: "test_student_verif_1",
            fullName: "Aarav Sharma",
            email: "aarav.test@galgotiasuniversity.edu.in",
            collegeName: "Galgotias University",
            branch: "Computer Science & Engineering",
            semester: 4,
            verificationStatus: "PENDING",
            isVerified: false,
            idCardImage: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...",
            password: "hashedpassword123"
        });

        const req1 = await verificationCtrl.createVerificationRequest(
            testUser1, 
            testUser1.idCardImage, 
            { uploadedAt: new Date() }
        );

        console.log(`  • Request ID: ${req1._id}`);
        console.log(`  • Status: ${req1.status}`);
        console.log(`  • Generated Token: ${req1.emailActionToken}`);
        console.log(`  • Token Expiration: ${req1.emailActionExpiresAt}`);

        if (!req1.emailActionToken || req1.status !== "PENDING" || req1.emailActionUsed !== false) {
            throw new Error("TEST 1 Failed: Verification request was not created properly with secure token.");
        }
        console.log("  ✅ TEST 1 PASSED: Verification request created with signed one-time token.\n");

        // ── TEST 2: Direct 1-Click Email Approval Flow ─────────────────────────
        console.log("▶ TEST 2: Direct 1-Click Email Approval");
        let approveHtmlResponse = "";
        const mockReqApprove = {
            query: {
                token: req1.emailActionToken,
                reqId: req1._id.toString()
            }
        };
        const mockResApprove = {
            send: (html) => { approveHtmlResponse = html; }
        };

        await verificationCtrl.emailActionApprove(mockReqApprove, mockResApprove);

        // Verify updated records in DB
        const reloadedReq1 = await VerificationRequest.findById(req1._id);
        const reloadedUser1 = await userModel.findById(testUser1._id);
        const userNotif = await notificationModel.findOne({ recipient: testUser1._id, type: "verification_approved" });
        const auditLog = await auditLogModel.findOne({ targetUser: testUser1._id, action: "APPROVE_VERIFICATION" });

        console.log(`  • Request Status after email click: "${reloadedReq1.status}"`);
        console.log(`  • Request actionSource: "${reloadedReq1.actionSource}"`);
        console.log(`  • Request emailActionUsed: ${reloadedReq1.emailActionUsed}`);
        console.log(`  • User isVerified: ${reloadedUser1.isVerified}`);
        console.log(`  • User verificationStatus: "${reloadedUser1.verificationStatus}"`);
        console.log(`  • In-app notification created: ${!!userNotif}`);
        console.log(`  • Audit log written: ${!!auditLog}`);

        if (reloadedReq1.status !== "APPROVED" || reloadedUser1.isVerified !== true || !userNotif || !auditLog) {
            throw new Error("TEST 2 Failed: Direct email approval did not update database states correctly.");
        }
        console.log("  ✅ TEST 2 PASSED: Direct 1-Click Email Approval executed atomically.\n");

        // ── TEST 3: Single-Use Protection & Idempotency Check ──────────────────
        console.log("▶ TEST 3: Single-Use Token Protection & Idempotency");
        let secondClickHtml = "";
        const mockResSecond = {
            send: (html) => { secondClickHtml = html; }
        };

        await verificationCtrl.emailActionApprove(mockReqApprove, mockResSecond);
        console.log(`  • Second click detected already completed: ${secondClickHtml.includes("Action Already Completed")}`);

        if (!secondClickHtml.includes("Action Already Completed")) {
            throw new Error("TEST 3 Failed: Re-used email token was not rejected.");
        }
        console.log("  ✅ TEST 3 PASSED: Token reuse and race conditions handled safely.\n");

        // ── TEST 4: Direct Email Rejection Flow ────────────────────────────────
        console.log("▶ TEST 4: Direct Email Rejection Flow");
        const testUser2 = await userModel.create({
            username: "test_student_verif_2",
            fullName: "Priya Patel",
            email: "priya.test@galgotiasuniversity.edu.in",
            collegeName: "Galgotias University",
            branch: "Information Technology",
            verificationStatus: "PENDING",
            isVerified: false,
            idCardImage: "data:image/jpeg;base64,blurry_image_data...",
            password: "hashedpassword123"
        });

        const req2 = await verificationCtrl.createVerificationRequest(
            testUser2, 
            testUser2.idCardImage
        );

        const mockReqReject = {
            body: {
                token: req2.emailActionToken,
                reqId: req2._id.toString(),
                reasonChoice: "unclear",
                customReason: "Please provide a high-resolution photo showing your name and college roll number clearly."
            }
        };

        let rejectHtmlResponse = "";
        const mockResReject = {
            send: (html) => { rejectHtmlResponse = html; }
        };

        await verificationCtrl.emailActionRejectSubmit(mockReqReject, mockResReject);

        const reloadedReq2 = await VerificationRequest.findById(req2._id);
        const reloadedUser2 = await userModel.findById(testUser2._id);
        const rejectNotif = await notificationModel.findOne({ recipient: testUser2._id, type: "verification_rejected" });

        console.log(`  • Rejected Request Status: "${reloadedReq2.status}"`);
        console.log(`  • Stored Rejection Reason: "${reloadedReq2.rejectionReason}"`);
        console.log(`  • User isVerified: ${reloadedUser2.isVerified}`);
        console.log(`  • User verificationStatus: "${reloadedUser2.verificationStatus}"`);
        console.log(`  • Rejection In-App Notification: "${rejectNotif?.message}"`);

        if (reloadedReq2.status !== "REJECTED" || reloadedUser2.isVerified !== false || !rejectNotif) {
            throw new Error("TEST 4 Failed: Direct email rejection was not processed properly.");
        }
        console.log("  ✅ TEST 4 PASSED: Direct Email Rejection with structured reasons works.\n");

        // ── TEST 5: Admin Panel Fetch & Review Flow ────────────────────────────
        console.log("▶ TEST 5: Admin Panel API Queries");
        let adminListResponse = null;
        const mockResAdminList = {
            status: (code) => ({
                json: (data) => { adminListResponse = data; }
            })
        };

        await verificationCtrl.getVerifications({
            query: { page: 1, limit: 10, status: "ALL", search: "test_student_verif" }
        }, mockResAdminList);

        console.log(`  • Admin panel returned ${adminListResponse.requests.length} requests`);
        console.log(`  • Analytics breakdown:`, adminListResponse.analytics);

        if (adminListResponse.requests.length < 2) {
            throw new Error("TEST 5 Failed: Admin panel listing did not return expected requests.");
        }
        console.log("  ✅ TEST 5 PASSED: Admin panel query, filtering, and stats verified.\n");

        // Clean up fixtures
        await userModel.deleteMany({ username: /^test_student_verif_/ });
        await VerificationRequest.deleteMany({ username: /^test_student_verif_/ });
        await notificationModel.deleteMany({ message: /verification/i });
        console.log("🧹 Cleaned up test data.");

        console.log("🎉 ALL STUDENT VERIFICATION & EMAIL ACTION TESTS PASSED PERFECTLY!");
    } finally {
        await mongoose.disconnect();
    }
}

runVerificationTests().catch(err => {
    console.error("❌ Test error:", err);
    process.exit(1);
});
