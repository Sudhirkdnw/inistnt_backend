const crypto = require("crypto");
const mongoose = require("mongoose");
const VerificationRequest = require("../models/verificationRequest.model");
const userModel = require("../models/user.model");
const notificationModel = require("../models/notification.model");
const auditLogModel = require("../models/auditLog.model");
const InfrastructureLogger = require("../utils/infrastructureLogger");
const { getSetting } = require("../utils/settings");
const { 
    sendAdminVerificationRequestEmail, 
    sendApprovalEmail, 
    sendRejectionEmail 
} = require("../services/emailService");

/**
 * Utility to log verification audit entries safely
 */
async function logVerificationAudit(adminId, action, targetUserId, reqId, details, source = "ADMIN_PANEL", reason = "") {
    try {
        await auditLogModel.create({
            admin: adminId || targetUserId, // Fallback if performed via signed email action
            action,
            targetUser: targetUserId,
            details: `Verification ${action} via ${source}. ${details ? `Notes: ${details}` : ''} ${reason ? `Reason: ${reason}` : ''}`.trim(),
            ipAddress: source,
            updatedValues: { action, source, reason, details, verificationRequestId: reqId }
        });
    } catch (err) {
        console.error("Failed to write verification audit log:", err.message);
    }
}

/**
 * Generate a cryptographically secure signed one-time token for email actions
 */
function generateEmailActionToken() {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * Helper to dispatch email notification to verification admins
 */
async function notifyAdminsNewVerification(verificationDoc, userDoc) {
    try {
        let backendUrl = process.env.API_BASE_URL || process.env.BACKEND_URL || getSetting("backend_url", "https://api.hykee.in") || "https://api.hykee.in";
        if (backendUrl.includes("localhost")) {
            backendUrl = "https://api.hykee.in";
        }
        let adminUrl = process.env.ADMIN_URL || getSetting("admin_url", "https://adminfz.vercel.app") || "https://adminfz.vercel.app";
        if (adminUrl.includes("netlify.app") || adminUrl.includes("localhost")) {
            adminUrl = "https://adminfz.vercel.app";
        }

        const approveUrl = `${backendUrl}/api/verifications/email-action/approve?token=${verificationDoc.emailActionToken}&reqId=${verificationDoc._id}`;
        const rejectUrl = `${backendUrl}/api/verifications/email-action/reject-form?token=${verificationDoc.emailActionToken}&reqId=${verificationDoc._id}`;
        const adminPanelUrl = `${adminUrl}/verifications`;

        const studentDetails = {
            name: verificationDoc.fullName || userDoc.fullName || userDoc.username,
            email: verificationDoc.email || userDoc.email || userDoc.collegeEmail,
            collegeName: verificationDoc.collegeName || userDoc.collegeName,
            branch: verificationDoc.branch || userDoc.branch,
            semester: verificationDoc.semester || userDoc.semester,
            submittedAt: new Date(verificationDoc.createdAt).toLocaleString(),
            idCardImage: verificationDoc.idCardImage
        };

        // Determine destination admin email(s)
        const explicitAdminEmail = process.env.ADMIN_VERIFICATION_EMAIL || getSetting("admin_verification_email", "");
        let targetEmails = [];

        if (explicitAdminEmail) {
            targetEmails.push(explicitAdminEmail);
        } else {
            // Find superadmins and admins
            const adminUsers = await userModel.find({ role: { $in: ["admin", "superadmin"] }, email: { $exists: true, $ne: "" } }).select("email");
            targetEmails = adminUsers.map(a => a.email).filter(Boolean);
        }

        // Fallback default if none configured
        if (targetEmails.length === 0) {
            targetEmails = [process.env.EMAIL_FROM || "admin@hykee.in"];
        }

        for (const adminEmail of targetEmails) {
            sendAdminVerificationRequestEmail(
                adminEmail,
                studentDetails,
                approveUrl,
                rejectUrl,
                adminPanelUrl
            ).catch(err => {
                console.error(`Failed to send verification notification email to ${adminEmail}:`, err.message);
            });
        }
    } catch (err) {
        console.error("Error in notifyAdminsNewVerification:", err.message);
    }
}

/**
 * 1. Create a new verification request (called from registration or resubmission)
 */
exports.createVerificationRequest = async (userDoc, idCardImage, idCardMetadata = {}) => {
    try {
        const token = generateEmailActionToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days valid

        const newRequest = await VerificationRequest.create({
            user: userDoc._id,
            fullName: userDoc.fullName || "",
            username: userDoc.username || "",
            email: userDoc.email || userDoc.collegeEmail || "",
            collegeName: userDoc.collegeName || "",
            branch: userDoc.branch || "",
            semester: userDoc.semester || null,
            idCardImage,
            idCardMetadata,
            status: "PENDING",
            emailActionToken: token,
            emailActionExpiresAt: expiresAt,
            emailActionUsed: false
        });

        // Asynchronously notify admins via email
        notifyAdminsNewVerification(newRequest, userDoc);

        // Real-time broadcast to Admin Dashboard
        if (global.ioInstance) {
            global.ioInstance.to("admin:monitoring").emit("new-id-verification", {
                requestId: newRequest._id,
                userId: userDoc._id,
                username: userDoc.username,
                collegeName: userDoc.collegeName,
                submittedAt: newRequest.createdAt
            });
            global.ioInstance.emit("verification-updated", {
                action: "NEW_SUBMISSION",
                userId: userDoc._id
            });
        }

        return newRequest;
    } catch (err) {
        console.error("Failed to create verification request:", err);
        throw err;
    }
};

/**
 * 2. GET /api/admin/verifications — Admin Panel Listing & Stats
 */
exports.getVerifications = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = "", 
            status = "PENDING", 
            college = "",
            sort = "newest" 
        } = req.query;

        const query = {};

        // Status Filter
        if (status && status !== "ALL") {
            query.status = status.toUpperCase();
        }

        // College Filter
        if (college && college !== "ALL") {
            query.collegeName = new RegExp(`^${college.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i");
        }

        // Search Filter (Name, Email, Username, College)
        if (search && search.trim()) {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
            query.$or = [
                { fullName: regex },
                { username: regex },
                { email: regex },
                { collegeName: regex },
                { branch: regex }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

        const [requests, total, pendingCount, approvedCount, rejectedCount, collegesList] = await Promise.all([
            VerificationRequest.find(query)
                .populate("user", "username fullName email avatar photos isVerified verificationStatus collegeName branch semester createdAt")
                .populate("reviewedBy", "username fullName email")
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit)),
            VerificationRequest.countDocuments(query),
            VerificationRequest.countDocuments({ status: "PENDING" }),
            VerificationRequest.countDocuments({ status: "APPROVED" }),
            VerificationRequest.countDocuments({ status: "REJECTED" }),
            VerificationRequest.distinct("collegeName", { collegeName: { $ne: "" } })
        ]);

        return res.status(200).json({
            success: true,
            requests,
            total,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            },
            analytics: {
                pending: pendingCount,
                approved: approvedCount,
                rejected: rejectedCount,
                total: pendingCount + approvedCount + rejectedCount
            },
            colleges: collegesList
        });
    } catch (error) {
        console.error("Error in getVerifications:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 3. PUT /api/admin/verifications/:id — Admin Panel Action (Approve / Reject)
 */
exports.handleVerificationAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason, notes } = req.body; // action: "approve" | "reject"

        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({ success: false, message: "Action must be 'approve' or 'reject'." });
        }

        // Find verification request
        const request = await VerificationRequest.findById(id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Verification request not found." });
        }

        if (request.status !== "PENDING") {
            return res.status(400).json({ 
                success: false, 
                message: `This verification request has already been ${request.status.toLowerCase()}.` 
            });
        }

        const user = await userModel.findById(request.user);
        if (!user) {
            return res.status(404).json({ success: false, message: "Associated student user not found." });
        }

        const now = new Date();

        if (action === "approve") {
            // Update Verification Request
            request.status = "APPROVED";
            request.adminNotes = notes || "Approved via Admin Panel.";
            request.rejectionReason = "";
            request.reviewedBy = req.user._id;
            request.reviewedAt = now;
            request.actionSource = "ADMIN_PANEL";
            request.emailActionUsed = true; // Invalidate email action links
            await request.save();

            // Update User Document
            user.isVerified = true;
            user.verificationStatus = "APPROVED";
            user.rejectionReason = "";
            user.adminReviewNotes = notes || "Approved via Admin Panel.";
            user.reviewedBy = req.user._id;
            user.reviewedAt = now;
            await user.save();

            // Send in-app notification to student
            await notificationModel.create({
                recipient: user._id,
                sender: req.user._id,
                type: "verification_approved",
                message: "Congratulations! Your student identity has been verified. You now have full verified status on Hykee. 🎓"
            });

            // Send Approval Email to student asynchronously
            sendApprovalEmail(user.email || user.collegeEmail, user.fullName || user.username).catch(err => {
                console.error("Failed to send student approval email:", err.message);
            });

            // Log Audit
            await logVerificationAudit(req.user._id, "APPROVE_VERIFICATION", user._id, request._id, notes, "ADMIN_PANEL");

            // Real-time Socket Event
            if (global.ioInstance) {
                global.ioInstance.to(`user:${user._id}`).emit("verification-status-changed", {
                    status: "APPROVED",
                    isVerified: true
                });
                global.ioInstance.emit("verification-updated", {
                    action: "APPROVED",
                    userId: user._id
                });
            }

            return res.status(200).json({
                success: true,
                message: `Student @${user.username} has been successfully verified!`,
                request
            });
        } else {
            const finalReason = reason || "Your college ID card upload could not be verified. Please submit a clearer copy.";

            // Update Verification Request
            request.status = "REJECTED";
            request.rejectionReason = finalReason;
            request.adminNotes = notes || "Rejected via Admin Panel.";
            request.reviewedBy = req.user._id;
            request.reviewedAt = now;
            request.actionSource = "ADMIN_PANEL";
            request.emailActionUsed = true; // Invalidate email action links
            await request.save();

            // Update User Document
            user.isVerified = false;
            user.verificationStatus = "REJECTED";
            user.rejectionReason = finalReason;
            user.adminReviewNotes = notes || "Rejected via Admin Panel.";
            user.reviewedBy = req.user._id;
            user.reviewedAt = now;
            await user.save();

            // Send in-app notification to student
            await notificationModel.create({
                recipient: user._id,
                sender: req.user._id,
                type: "verification_rejected",
                message: `Your verification request was not approved: ${finalReason}. You can resubmit with a clearer ID card.`
            });

            // Send Rejection Email to student asynchronously
            sendRejectionEmail(user.email || user.collegeEmail, user.fullName || user.username, finalReason).catch(err => {
                console.error("Failed to send student rejection email:", err.message);
            });

            // Log Audit
            await logVerificationAudit(req.user._id, "REJECT_VERIFICATION", user._id, request._id, notes, "ADMIN_PANEL", finalReason);

            // Real-time Socket Event
            if (global.ioInstance) {
                global.ioInstance.to(`user:${user._id}`).emit("verification-status-changed", {
                    status: "REJECTED",
                    isVerified: false,
                    reason: finalReason
                });
                global.ioInstance.emit("verification-updated", {
                    action: "REJECTED",
                    userId: user._id
                });
            }

            return res.status(200).json({
                success: true,
                message: `Verification request rejected for @${user.username}.`,
                request
            });
        }
    } catch (error) {
        console.error("Error in handleVerificationAdmin:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 4. GET /api/verifications/email-action/approve — 1-Click Secure Direct Email Approval
 */
exports.emailActionApprove = async (req, res) => {
    try {
        const { token, reqId } = req.query;

        if (!token || !reqId) {
            return res.send(renderEmailActionResponsePage({
                title: "Invalid Verification Link",
                status: "error",
                heading: "Invalid Verification Action",
                message: "The verification link provided is missing required security parameters."
            }));
        }

        // Atomically find and claim the pending verification request
        const request = await VerificationRequest.findOne({
            _id: reqId,
            emailActionToken: token
        });

        if (!request) {
            return res.send(renderEmailActionResponsePage({
                title: "Request Not Found",
                status: "error",
                heading: "Verification Request Not Found",
                message: "This verification request could not be located in our system."
            }));
        }

        // Check if already used or already processed
        if (request.emailActionUsed || request.status !== "PENDING") {
            return res.send(renderEmailActionResponsePage({
                title: "Action Already Completed",
                status: "info",
                heading: "Action Already Completed",
                message: `This student verification request has already been processed and is currently marked as <strong>${request.status}</strong>.`
            }));
        }

        // Check expiration
        if (request.emailActionExpiresAt && new Date() > new Date(request.emailActionExpiresAt)) {
            return res.send(renderEmailActionResponsePage({
                title: "Verification Link Expired",
                status: "warning",
                heading: "Verification Link Expired",
                message: "This secure verification link has expired. Please manage this request from the Admin Panel."
            }));
        }

        // Atomically approve
        const now = new Date();
        request.status = "APPROVED";
        request.actionSource = "EMAIL";
        request.emailActionUsed = true;
        request.reviewedAt = now;
        request.adminNotes = "Approved directly via 1-click email action link.";
        await request.save();

        const user = await userModel.findById(request.user);
        if (user) {
            user.isVerified = true;
            user.verificationStatus = "APPROVED";
            user.reviewedAt = now;
            user.adminReviewNotes = "Approved directly via email action.";
            await user.save();

            // Send in-app notification
            await notificationModel.create({
                recipient: user._id,
                sender: user._id,
                type: "verification_approved",
                message: "Congratulations! Your student identity has been verified. You now have full verified status on Hykee. 🎓"
            });

            // Send Approval Email to student
            sendApprovalEmail(user.email || user.collegeEmail, user.fullName || user.username).catch(() => {});

            // Log Audit
            await logVerificationAudit(null, "APPROVE_VERIFICATION", user._id, request._id, "1-Click Direct Email Approval", "EMAIL");

            // Real-time Socket Event
            if (global.ioInstance) {
                global.ioInstance.to(`user:${user._id}`).emit("verification-status-changed", {
                    status: "APPROVED",
                    isVerified: true
                });
                global.ioInstance.emit("verification-updated", {
                    action: "APPROVED",
                    userId: user._id
                });
            }
        }

        return res.send(renderEmailActionResponsePage({
            title: "Student Account Verified",
            status: "success",
            heading: "Student Account Verified! 🎓",
            message: `<strong>${request.fullName || request.username}</strong> (${request.collegeName || 'Student'}) has been successfully approved and verified on Hykee.`,
            details: [
                { label: "Student Name", value: request.fullName || request.username },
                { label: "College", value: request.collegeName },
                { label: "Branch", value: request.branch || "N/A" },
                { label: "Verified At", value: now.toLocaleString() },
                { label: "Verification Source", value: "Verified via Secure Admin Email" }
            ]
        }));
    } catch (error) {
        console.error("Error in emailActionApprove:", error);
        return res.send(renderEmailActionResponsePage({
            title: "Verification Error",
            status: "error",
            heading: "An Error Occurred",
            message: error.message || "Failed to complete email verification."
        }));
    }
};

/**
 * 5. GET /api/verifications/email-action/reject-form — Secure Interactive Rejection Form
 */
exports.emailActionRejectForm = async (req, res) => {
    try {
        const { token, reqId } = req.query;

        if (!token || !reqId) {
            return res.send(renderEmailActionResponsePage({
                title: "Invalid Verification Link",
                status: "error",
                heading: "Invalid Verification Action",
                message: "Missing security verification parameters in URL."
            }));
        }

        const request = await VerificationRequest.findOne({
            _id: reqId,
            emailActionToken: token
        });

        if (!request) {
            return res.send(renderEmailActionResponsePage({
                title: "Request Not Found",
                status: "error",
                heading: "Request Not Found",
                message: "The requested verification record could not be found."
            }));
        }

        if (request.emailActionUsed || request.status !== "PENDING") {
            return res.send(renderEmailActionResponsePage({
                title: "Action Already Completed",
                status: "info",
                heading: "Action Already Completed",
                message: `This verification request has already been processed (Current Status: <strong>${request.status}</strong>).`
            }));
        }

        if (request.emailActionExpiresAt && new Date() > new Date(request.emailActionExpiresAt)) {
            return res.send(renderEmailActionResponsePage({
                title: "Verification Link Expired",
                status: "warning",
                heading: "Verification Link Expired",
                message: "This secure rejection link has expired. Please manage this request from the Admin Panel."
            }));
        }

        return res.send(renderRejectionFormPage(request, token));
    } catch (error) {
        console.error("Error in emailActionRejectForm:", error);
        return res.send(renderEmailActionResponsePage({
            title: "System Error",
            status: "error",
            heading: "Error Loading Form",
            message: error.message
        }));
    }
};

/**
 * 6. POST /api/verifications/email-action/reject — Submit Direct Rejection from Email Form
 */
exports.emailActionRejectSubmit = async (req, res) => {
    try {
        const { token, reqId, reasonChoice, customReason } = req.body;

        if (!token || !reqId) {
            return res.send(renderEmailActionResponsePage({
                title: "Invalid Request",
                status: "error",
                heading: "Invalid Parameters",
                message: "Security tokens were missing from the form submission."
            }));
        }

        const request = await VerificationRequest.findOne({
            _id: reqId,
            emailActionToken: token
        });

        if (!request || request.emailActionUsed || request.status !== "PENDING") {
            return res.send(renderEmailActionResponsePage({
                title: "Action Already Completed",
                status: "info",
                heading: "Action Already Completed",
                message: "This verification request has already been processed."
            }));
        }

        let finalReason = "Your college ID card upload could not be verified.";
        if (reasonChoice === "unclear") {
            finalReason = "The college ID card image provided is blurry or unreadable. Please upload a clear photo.";
        } else if (reasonChoice === "mismatch") {
            finalReason = "The details on the college ID card do not match the registered name or university.";
        } else if (reasonChoice === "invalid") {
            finalReason = "The document uploaded is not a valid recognized college student ID card.";
        } else if (reasonChoice === "expired") {
            finalReason = "The uploaded student ID card appears to be expired.";
        } else if (reasonChoice === "other" && customReason && customReason.trim()) {
            finalReason = customReason.trim();
        } else if (customReason && customReason.trim()) {
            finalReason = customReason.trim();
        }

        const now = new Date();
        request.status = "REJECTED";
        request.rejectionReason = finalReason;
        request.actionSource = "EMAIL";
        request.emailActionUsed = true;
        request.reviewedAt = now;
        request.adminNotes = `Rejected via secure email form. Reason: ${finalReason}`;
        await request.save();

        const user = await userModel.findById(request.user);
        if (user) {
            user.isVerified = false;
            user.verificationStatus = "REJECTED";
            user.rejectionReason = finalReason;
            user.reviewedAt = now;
            user.adminReviewNotes = `Rejected via email action: ${finalReason}`;
            await user.save();

            // Send in-app notification
            await notificationModel.create({
                recipient: user._id,
                sender: user._id,
                type: "verification_rejected",
                message: `Your verification request was not approved: ${finalReason}. You can resubmit with a clearer ID card.`
            });

            // Send Rejection Email to student
            sendRejectionEmail(user.email || user.collegeEmail, user.fullName || user.username, finalReason).catch(() => {});

            // Log Audit
            await logVerificationAudit(null, "REJECT_VERIFICATION", user._id, request._id, "Direct Email Rejection", "EMAIL", finalReason);

            // Real-time Socket Event
            if (global.ioInstance) {
                global.ioInstance.to(`user:${user._id}`).emit("verification-status-changed", {
                    status: "REJECTED",
                    isVerified: false,
                    reason: finalReason
                });
                global.ioInstance.emit("verification-updated", {
                    action: "REJECTED",
                    userId: user._id
                });
            }
        }

        return res.send(renderEmailActionResponsePage({
            title: "Verification Rejected",
            status: "warning",
            heading: "Verification Request Rejected",
            message: `The verification request for <strong>${request.fullName || request.username}</strong> has been rejected. The student has been notified with instructions to resubmit.`,
            details: [
                { label: "Student Name", value: request.fullName || request.username },
                { label: "College", value: request.collegeName },
                { label: "Rejection Reason", value: finalReason },
                { label: "Processed At", value: now.toLocaleString() }
            ]
        }));
    } catch (error) {
        console.error("Error in emailActionRejectSubmit:", error);
        return res.send(renderEmailActionResponsePage({
            title: "System Error",
            status: "error",
            heading: "Rejection Error",
            message: error.message
        }));
    }
};

/**
 * 7. POST /api/users/submit-id-verification — Mobile Resubmission Endpoint
 */
exports.submitUserVerification = async (req, res) => {
    try {
        const user = await userModel.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "College ID Card image file is required." });
        }

        const { collegeName, branch, semester, fullName } = req.body;

        const sharp = require("sharp");
        const compressedBuffer = await sharp(req.file.buffer)
            .resize({ width: 1000, withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();

        const base64 = compressedBuffer.toString("base64");
        const idCardImage = `data:image/jpeg;base64,${base64}`;

        const idCardMetadata = {
            mimeType: "image/jpeg",
            size: compressedBuffer.length,
            originalSize: req.file.size,
            uploadedAt: new Date()
        };

        if (collegeName) user.collegeName = collegeName.trim();
        if (branch) user.branch = branch.trim();
        if (semester) user.semester = Number(semester);
        if (fullName) user.fullName = fullName.trim();

        user.idCardImage = idCardImage;
        user.idCardMetadata = idCardMetadata;
        user.verificationStatus = "PENDING";
        user.isVerified = false;
        user.rejectionReason = "";
        await user.save();

        // Create new verification request record
        const newReq = await exports.createVerificationRequest(user, idCardImage, idCardMetadata);

        return res.status(200).json({
            success: true,
            message: "Your verification request has been submitted and is under review.",
            verificationStatus: "PENDING",
            requestId: newReq._id
        });
    } catch (error) {
        console.error("Error in submitUserVerification:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// 🎨 SLEEK BRANDED HTML PAGES FOR EMAIL ACTIONS
// ─────────────────────────────────────────────────────────────

function renderEmailActionResponsePage({ title, status, heading, message, details = [] }) {
    const isSuccess = status === "success";
    const isError = status === "error";
    const isWarning = status === "warning";

    const badgeColor = isSuccess ? "#16A34A" : isError ? "#DC2626" : isWarning ? "#D97706" : "#4F46E5";
    const badgeBg = isSuccess ? "#DCFCE7" : isError ? "#FEE2E2" : isWarning ? "#FEF3C7" : "#EEF2FF";
    const icon = isSuccess ? "✓" : isError ? "✕" : isWarning ? "⚠" : "ℹ";

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} — Hykee</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Inter', sans-serif;
                background: #090A10;
                color: #F8FAFC;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
            }
            .card {
                background: #121422;
                border: 1px solid #1E2238;
                border-radius: 24px;
                max-width: 520px;
                width: 100%;
                padding: 40px 32px;
                text-align: center;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            }
            .icon-badge {
                width: 64px;
                height: 64px;
                border-radius: 50%;
                background: ${badgeBg};
                color: ${badgeColor};
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 28px;
                font-weight: 800;
                margin-bottom: 24px;
            }
            h1 {
                font-size: 24px;
                font-weight: 800;
                margin-bottom: 12px;
                color: #FFFFFF;
            }
            p.desc {
                font-size: 15px;
                color: #94A3B8;
                line-height: 1.6;
                margin-bottom: 24px;
            }
            .details-box {
                background: #0B0D17;
                border: 1px solid #1E2238;
                border-radius: 16px;
                padding: 18px 20px;
                text-align: left;
                margin-bottom: 28px;
            }
            .detail-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                font-size: 13px;
                border-bottom: 1px solid #171A2E;
            }
            .detail-row:last-child { border-bottom: none; }
            .detail-label { color: #64748B; font-weight: 500; }
            .detail-value { color: #F1F5F9; font-weight: 600; text-align: right; }
            .btn {
                display: inline-block;
                background: #4F46E5;
                color: #FFFFFF;
                text-decoration: none;
                font-size: 14px;
                font-weight: 700;
                padding: 12px 28px;
                border-radius: 12px;
                transition: all 0.2s ease;
            }
            .btn:hover { background: #4338CA; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon-badge">${icon}</div>
            <h1>${heading}</h1>
            <p class="desc">${message}</p>

            ${details.length > 0 ? `
            <div class="details-box">
                ${details.map(d => `
                    <div class="detail-row">
                        <span class="detail-label">${d.label}</span>
                        <span class="detail-value">${d.value}</span>
                    </div>
                `).join('')}
            </div>
            ` : ''}

            <a href="https://adminfz.vercel.app/verifications" class="btn">Open Admin Dashboard</a>
        </div>
    </body>
    </html>
    `;
}

function renderRejectionFormPage(request, token) {
    let backendUrl = process.env.API_BASE_URL || process.env.BACKEND_URL || getSetting("backend_url", "https://api.hykee.in") || "https://api.hykee.in";
    if (backendUrl.includes("localhost")) {
        backendUrl = "https://api.hykee.in";
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reject Student Verification — Hykee</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Inter', sans-serif;
                background: #090A10;
                color: #F8FAFC;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
            }
            .container {
                background: #121422;
                border: 1px solid #1E2238;
                border-radius: 24px;
                max-width: 560px;
                width: 100%;
                padding: 36px 32px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            }
            .badge {
                display: inline-block;
                background: #FEE2E2;
                color: #DC2626;
                font-size: 11px;
                font-weight: 800;
                padding: 4px 10px;
                border-radius: 6px;
                margin-bottom: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; color: #FFFFFF; }
            p.sub { font-size: 13px; color: #94A3B8; margin-bottom: 24px; }
            .student-card {
                background: #0B0D17;
                border: 1px solid #1E2238;
                border-radius: 14px;
                padding: 16px;
                margin-bottom: 24px;
                font-size: 13px;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-bottom: 12px;
            }
            .info-item { display: flex; flex-direction: column; }
            .info-item .lbl { color: #64748B; font-size: 11px; font-weight: 600; text-transform: uppercase; }
            .info-item .val { color: #F1F5F9; font-size: 13px; font-weight: 700; }
            .img-preview {
                text-align: center;
                margin-top: 12px;
                border-top: 1px solid #1E2238;
                padding-top: 12px;
            }
            .img-preview img {
                max-height: 160px;
                max-width: 100%;
                border-radius: 8px;
                border: 1px solid #2A2F4C;
            }
            .form-group { margin-bottom: 20px; }
            label { display: block; font-size: 13px; font-weight: 600; color: #CBD5E1; margin-bottom: 8px; }
            .radio-group { display: flex; flex-direction: column; gap: 8px; }
            .radio-option {
                background: #0B0D17;
                border: 1px solid #1E2238;
                border-radius: 10px;
                padding: 10px 14px;
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                font-size: 13px;
                color: #E2E8F0;
                transition: all 0.2s ease;
            }
            .radio-option:hover { border-color: #4F46E5; }
            input[type="radio"] { accent-color: #EF4444; width: 16px; height: 16px; }
            textarea {
                width: 100%;
                background: #0B0D17;
                border: 1px solid #1E2238;
                border-radius: 10px;
                padding: 12px;
                color: #F8FAFC;
                font-size: 13px;
                font-family: inherit;
                resize: vertical;
                min-height: 70px;
                outline: none;
            }
            textarea:focus { border-color: #EF4444; }
            .btn-reject {
                width: 100%;
                background: #E11D48;
                color: #FFFFFF;
                border: none;
                padding: 14px;
                border-radius: 12px;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
                transition: background 0.2s ease;
            }
            .btn-reject:hover { background: #BE123C; }
        </style>
    </head>
    <body>
        <div class="container">
            <span class="badge">Verification Action</span>
            <h1>Confirm Rejection</h1>
            <p class="sub">Select or provide a reason so the student understands why their ID card was rejected and how to resubmit.</p>

            <div class="student-card">
                <div class="info-grid">
                    <div class="info-item">
                        <span class="lbl">Student Name</span>
                        <span class="val">${request.fullName || request.username}</span>
                    </div>
                    <div class="info-item">
                        <span class="lbl">Email</span>
                        <span class="val">${request.email || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="lbl">College</span>
                        <span class="val">${request.collegeName || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="lbl">Branch</span>
                        <span class="val">${request.branch || 'N/A'}</span>
                    </div>
                </div>
                ${request.idCardImage ? `
                <div class="img-preview">
                    <img src="${request.idCardImage}" alt="Uploaded College ID" />
                </div>
                ` : ''}
            </div>

            <form action="${backendUrl}/api/verifications/email-action/reject" method="POST">
                <input type="hidden" name="token" value="${token}" />
                <input type="hidden" name="reqId" value="${request._id}" />

                <div class="form-group">
                    <label>Select Rejection Reason:</label>
                    <div class="radio-group">
                        <label class="radio-option">
                            <input type="radio" name="reasonChoice" value="unclear" checked />
                            <span>ID card photo is unclear, blurry, or unreadable</span>
                        </label>
                        <label class="radio-option">
                            <input type="radio" name="reasonChoice" value="mismatch" />
                            <span>ID card does not match registered student information</span>
                        </label>
                        <label class="radio-option">
                            <input type="radio" name="reasonChoice" value="invalid" />
                            <span>Invalid document / not a recognized student ID card</span>
                        </label>
                        <label class="radio-option">
                            <input type="radio" name="reasonChoice" value="expired" />
                            <span>Student ID card has expired</span>
                        </label>
                        <label class="radio-option">
                            <input type="radio" name="reasonChoice" value="other" />
                            <span>Other reason (specify below)</span>
                        </label>
                    </div>
                </div>

                <div class="form-group">
                    <label>Custom Notes / Additional Details (Optional):</label>
                    <textarea name="customReason" placeholder="Enter custom feedback for the student..."></textarea>
                </div>

                <button type="submit" class="btn-reject">Confirm Rejection & Notify Student</button>
            </form>
        </div>
    </body>
    </html>
    `;
}
