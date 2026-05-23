const userModel = require("../models/user.model");
const confessionModel = require("../models/confession.model");
const reportModel = require("../models/report.model");
const auditLogModel = require("../models/auditLog.model");
const InfrastructureLogger = require("../utils/infrastructureLogger");

// Helper to record admin actions
const logAudit = async (adminId, action, options = {}) => {
    try {
        await auditLogModel.create({
            admin: adminId,
            action,
            targetUser: options.targetUser,
            targetConfession: options.targetConfession,
            details: options.details,
            ipAddress: options.ipAddress
        });
    } catch (err) {
        console.error("Audit log failed:", err.message);
    }
};

// GET /api/admin/dashboard
const getDashboard = async (req, res) => {
    try {
        const now = new Date();
        const last24h = new Date(now - 24 * 60 * 60 * 1000);
        const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

        const [
            totalUsers, activeUsers24h, onlineUsersCount,
            totalConfessions, confessions24h,
            totalReports, pendingReports,
            totalDatingProfiles, totalMatches,
            totalComments, totalMessages
        ] = await Promise.all([
            userModel.estimatedDocumentCount(),
            userModel.countDocuments({ lastActive: { $gte: last24h } }),
            userModel.countDocuments({ lastActive: { $gte: new Date(now - 5 * 60 * 1000) } }), // Active in last 5 mins
            confessionModel.estimatedDocumentCount(),
            confessionModel.countDocuments({ createdAt: { $gte: last24h } }),
            reportModel.estimatedDocumentCount(),
            reportModel.countDocuments({ status: "pending" }),
            require("../models/dating.model").estimatedDocumentCount(),
            // Assuming there's a match model or counting based on dating profile
            0, // Placeholder for matches
            require("../models/comment.model").estimatedDocumentCount(),
            require("../models/message.model").estimatedDocumentCount()
        ]);

        const recentUsers = await userModel.find().sort({ createdAt: -1 }).limit(8).select("username fullName avatar createdAt verificationStatus");
        const recentConfessions = await confessionModel.find().sort({ createdAt: -1 }).limit(5).populate("user", "username avatar");
        const recentReports = await reportModel.find({ status: "pending" }).sort({ createdAt: -1 }).limit(5).populate("reporter", "username").populate("targetId");

        res.status(200).json({
            stats: { 
                totalUsers, activeUsers24h, onlineUsers: onlineUsersCount,
                totalConfessions, confessions24h,
                totalReports, pendingReports,
                dating: { profiles: totalDatingProfiles, matches: totalMatches },
                engagement: { comments: totalComments, messages: totalMessages }
            },
            recentUsers,
            recentConfessions,
            recentReports
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/users
const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";
        const status = req.query.status || "all"; // all, active, banned, soft_deleted

        let filter = {};
        
        if (search) {
            filter.$or = [
                { username: { $regex: search, $options: "i" } }, 
                { fullName: { $regex: search, $options: "i" } }
            ];
        }

        if (status === "active") {
            filter.isSoftDeleted = false;
            filter.isBanned = false;
        } else if (status === "banned") {
            filter.isBanned = true;
        } else if (status === "soft_deleted") {
            filter.isSoftDeleted = true;
        }

        const users = await userModel.find(filter).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limit);
        const total = await userModel.countDocuments(filter);

        res.status(200).json({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/users/:id
const getUserDetails = async (req, res) => {
    try {
        const user = await userModel.findById(req.params.id).select("-password");
        if (!user) return res.status(404).json({ message: "User not found" });

        const confessions = await confessionModel.find({ user: user._id }).sort({ createdAt: -1 });
        const reportsAgainst = await reportModel.find({ reportedUser: user._id });
        const suspiciousLogins = user.loginHistory.filter(h => h.isSuspicious).length;

        res.status(200).json({ user, confessions, reportsAgainst, security: { suspiciousLogins } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/users/:id/ban
const toggleBan = async (req, res) => {
    try {
        const user = await userModel.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.isBanned = !user.isBanned;
        await user.save();

        await logAudit(req.user._id, user.isBanned ? 'BAN_USER' : 'UNBAN_USER', {
            targetUser: user._id,
            ipAddress: req.ip
        });

        res.status(200).json({ message: user.isBanned ? "User banned" : "User unbanned", isBanned: user.isBanned });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/users/:id/role
const changeRole = async (req, res) => {
    try {
        const { role } = req.body;
        if (!["user", "admin"].includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        const user = await userModel.findByIdAndUpdate(req.params.id, { role }, { returnDocument: 'after' }).select("-password");
        if (!user) return res.status(404).json({ message: "User not found" });

        await logAudit(req.user._id, 'CHANGE_ROLE', {
            targetUser: user._id,
            details: `Role changed to ${role}`,
            ipAddress: req.ip
        });

        res.status(200).json({ message: "Role updated", user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/users/:id/restore
const restoreUser = async (req, res) => {
    try {
        const user = await userModel.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.isSoftDeleted = false;
        user.deletedAt = null;
        user.scheduledDeletionAt = null;
        user.deletedByUser = false;
        await user.save();

        await logAudit(req.user._id, 'RESTORE_USER', {
            targetUser: user._id,
            details: `Restored soft-deleted user @${user.username}`,
            ipAddress: req.ip
        });

        res.status(200).json({ message: "User account restored", user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
    try {
        const user = await userModel.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const username = user.username;
        await userModel.findByIdAndDelete(req.params.id);

        // Also delete their confessions
        await confessionModel.deleteMany({ user: req.params.id });

        await logAudit(req.user._id, 'PERMANENT_DELETE_USER', {
            targetUser: req.params.id,
            details: `Permanently deleted user @${username}`,
            ipAddress: req.ip
        });

        res.status(200).json({ message: "User and their confessions permanently deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/confessions
const getAllConfessions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const confessions = await confessionModel.find().populate("user", "username avatar").sort({ createdAt: -1 }).skip(skip).limit(limit);
        const total = await confessionModel.countDocuments();

        res.status(200).json({ confessions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/confessions/:id/hide
const toggleHideConfession = async (req, res) => {
    try {
        const confession = await confessionModel.findById(req.params.id);
        if (!confession) return res.status(404).json({ message: "Confession not found" });

        confession.isHidden = !confession.isHidden;
        await confession.save();

        res.status(200).json({ message: confession.isHidden ? "Confession hidden" : "Confession visible", isHidden: confession.isHidden });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/admin/confessions/:id
const deleteAnyConfession = async (req, res) => {
    try {
        const confession = await confessionModel.findByIdAndDelete(req.params.id);
        if (!confession) return res.status(404).json({ message: "Confession not found" });

        res.status(200).json({ message: "Confession deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/reports
const getReports = async (req, res) => {
    try {
        const status = req.query.status || "pending";
        const reports = await reportModel.find({ status })
            .populate("reporter", "username avatar")
            .populate("targetId")
            .sort({ createdAt: -1 });

        res.status(200).json({ reports });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/reports/:id
const updateReport = async (req, res) => {
    try {
        const { status, adminNote } = req.body;
        const report = await reportModel.findByIdAndUpdate(
            req.params.id,
            { 
                status, 
                adminNote,
                reviewedBy: req.user._id,
                resolvedAt: status !== 'pending' ? new Date() : null
            },
            { returnDocument: 'after' }
        );

        if (!report) return res.status(404).json({ message: "Report not found" });

        await logAudit(req.user._id, "update_report", "report", report._id, { status });

        res.status(200).json({ message: "Report updated", report });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/analytics
const getAnalytics = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [userGrowth, confessionActivity, commentActivity, datingActivity] = await Promise.all([
            userModel.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            confessionModel.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            require("../models/comment.model").aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            require("../models/dating.model").aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ])
        ]);

        res.status(200).json({ userGrowth, confessionActivity, commentActivity, datingActivity });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/verifications — Get users pending college verification & analytics
const getPendingVerifications = async (req, res) => {
    try {
        const { search, limit = 50, page = 1 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build query for pending verifications
        const query = {
            verificationStatus: { $in: ["pending", "PENDING"] }
        };

        if (search) {
            query.$or = [
                { username: { $regex: search, $options: "i" } },
                { fullName: { $regex: search, $options: "i" } },
                { collegeName: { $regex: search, $options: "i" } },
                { collegeEmail: { $regex: search, $options: "i" } }
            ];
        }

        const users = await userModel.find(query)
            .select("username fullName collegeName collegeEmail idCardImage verificationStatus verificationMethod createdAt idCardMetadata")
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await userModel.countDocuments(query);

        // Calculate manual review analytics dynamically
        const [pendingReviews, approvedCount, rejectedCount, reviewTimeData] = await Promise.all([
            userModel.countDocuments({ verificationStatus: { $in: ["pending", "PENDING"] } }),
            userModel.countDocuments({ verificationStatus: { $in: ["verified", "VERIFIED", "APPROVED"] } }),
            userModel.countDocuments({ verificationStatus: { $in: ["rejected", "REJECTED"] } }),
            userModel.aggregate([
                { $match: { reviewedAt: { $ne: null }, createdAt: { $ne: null } } },
                { 
                    $project: { 
                        duration: { $subtract: ["$reviewedAt", "$createdAt"] } 
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        avgDuration: { $avg: "$duration" } 
                    } 
                }
            ])
        ]);

        const avgReviewTimeMs = reviewTimeData.length > 0 ? reviewTimeData[0].avgDuration : 0;
        let avgReviewTime = "N/A";
        if (avgReviewTimeMs > 0) {
            const mins = Math.round(avgReviewTimeMs / 60000);
            if (mins < 60) {
                avgReviewTime = `${mins} min${mins !== 1 ? 's' : ''}`;
            } else {
                const hours = (mins / 60).toFixed(1);
                avgReviewTime = `${hours} hr${hours !== '1.0' ? 's' : ''}`;
            }
        }

        res.status(200).json({ 
            users, 
            total,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            },
            analytics: {
                pending: pendingReviews,
                approved: approvedCount,
                rejected: rejectedCount,
                avgReviewTime
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/verifications/:id — Approve or reject a user's verification
const handleVerification = async (req, res) => {
    try {
        const { action, reason, notes } = req.body; // action: "approve" | "reject"

        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({ message: "Action must be 'approve' or 'reject'" });
        }

        const user = await userModel.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const { sendApprovalEmail, sendRejectionEmail } = require("../services/emailService");

        if (action === "approve") {
            user.verificationStatus = "APPROVED";
            user.isVerified = true;
            user.rejectionReason = "";
            user.adminReviewNotes = notes || "Student identity verified successfully.";
            user.reviewedBy = req.user._id;
            user.reviewedAt = new Date();

            await user.save();

            // Dispatch Approval Email in background asynchronously
            sendApprovalEmail(user.email || user.collegeEmail || "student@zynk.edu", user.username)
                .then(() => {
                    InfrastructureLogger.email("SUCCESS", `Sent manual ID card approval email to user "${user.username}"`, {
                        userId: user._id,
                        email: user.email || user.collegeEmail
                    });
                })
                .catch(err => {
                    InfrastructureLogger.email("ERROR", `Failed to dispatch manual approval email for "${user.username}"`, {
                        error: err.message
                    });
                });

            // Log security and audit events
            InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" APPROVED student ID verification for user "${user.username}"`, {
                targetUserId: user._id,
                adminId: req.user._id
            });
            await logAudit(req.user._id, "APPROVE_VERIFICATION", { targetUserId: user._id, notes });
        } else {
            user.verificationStatus = "REJECTED";
            user.isVerified = false;
            user.rejectionReason = reason || "Your college ID card upload could not be verified. Please submit a clearer copy.";
            user.adminReviewNotes = notes || "Rejected due to invalid or blurry ID image.";
            user.reviewedBy = req.user._id;
            user.reviewedAt = new Date();

            await user.save();

            // Dispatch Rejection Email in background asynchronously
            sendRejectionEmail(user.email || user.collegeEmail || "student@zynk.edu", user.username, user.rejectionReason)
                .then(() => {
                    InfrastructureLogger.email("SUCCESS", `Sent manual ID card rejection email to user "${user.username}"`, {
                        userId: user._id,
                        email: user.email || user.collegeEmail,
                        reason: user.rejectionReason
                    });
                })
                .catch(err => {
                    InfrastructureLogger.email("ERROR", `Failed to dispatch manual rejection email for "${user.username}"`, {
                        error: err.message
                    });
                });

            // Log security and audit events
            InfrastructureLogger.security("WARNING", `Admin "${req.user.username}" REJECTED student ID verification for user "${user.username}". Reason: ${user.rejectionReason}`, {
                targetUserId: user._id,
                adminId: req.user._id,
                reason: user.rejectionReason
            });
            await logAudit(req.user._id, "REJECT_VERIFICATION", { targetUserId: user._id, reason, notes });
        }

        // Broadcast real-time Socket.IO update to all administrative observers
        if (global.ioInstance) {
            global.ioInstance.to("admin:monitoring").emit("verification-updated", {
                userId: user._id,
                username: user.username,
                status: user.verificationStatus,
                action,
                timestamp: new Date()
            });
        }

        res.status(200).json({
            message: action === "approve" ? "User student verification approved successfully" : "User verification rejected",
            user: { 
                _id: user._id, 
                username: user.username, 
                verificationStatus: user.verificationStatus,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/dating/profiles
const getAllDatingProfiles = async (req, res) => {
    try {
        const datingModel = require("../models/dating.model");
        const profiles = await datingModel.find()
            .populate("user", "username avatar")
            .sort({ createdAt: -1 });

        res.status(200).json({ profiles });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/dating/profiles/:id
const handleDatingProfile = async (req, res) => {
    try {
        const { action } = req.body; // action: "delete" | "warn"
        const datingModel = require("../models/dating.model");
        
        if (action === "delete") {
            await datingModel.findByIdAndDelete(req.params.id);
            return res.status(200).json({ message: "Dating profile deleted" });
        }

        res.status(400).json({ message: "Invalid action" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/audit-logs
const getAuditLogs = async (req, res) => {
    try {
        const logs = await auditLogModel.find()
            .populate("admin", "username avatar")
            .populate("targetUser", "username")
            .sort({ createdAt: -1 })
            .limit(100);
        res.status(200).json({ logs });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/settings
const getSettings = async (req, res) => {
    try {
        const settingsModel = require("../models/settings.model");
        const settings = await settingsModel.find().sort({ category: 1, key: 1 });
        res.status(200).json({ settings });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/settings/:key
const updateSetting = async (req, res) => {
    try {
        const { value } = req.body;
        const key = req.params.key;
        const settingsModel = require("../models/settings.model");
        const { updateSettingInCache } = require("../utils/settings");
        const { encrypt } = require("../utils/crypto");

        let finalValue = value;
        // Encrypt sensitive mail passwords before saving to DB
        if (key === 'mail_password' && value) {
            finalValue = encrypt(value);
        }

        const setting = await settingsModel.findOneAndUpdate(
            { key },
            { value: finalValue },
            { 
                returnDocument: 'after', 
                upsert: true 
            }
        );

        // Update in-memory cache (keep decrypted for immediate use if needed, 
        // but typically mailer utility does its own fetch/decrypt)
        updateSettingInCache(key, finalValue);

        // Notify via Socket.IO for real-time effects (maintenance mode, banners, etc.)
        const io = req.app.get("io");
        if (io) {
            io.emit("settings-updated", { key, value });
        }

        await logAudit(req.user._id, "update_setting", "setting", setting._id, { key, value });

        res.status(200).json({ message: `Setting ${key} updated`, setting });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/danger/flush-redis
const flushRedis = async (req, res) => {
    try {
        const { redisClient } = require("../utils/redis");
        if (redisClient) {
            await redisClient.flushAll();
            await logAudit(req.user._id, "flush_redis", "system", null, {});
            res.status(200).json({ message: "Redis cache cleared successfully" });
        } else {
            res.status(400).json({ message: "Redis not connected" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/danger/reset-passwords
const resetAllPasswords = async (req, res) => {
    try {
        const bcrypt = require("bcryptjs");
        const tempPassword = `RESET-${Math.random().toString(36).substring(7).toUpperCase()}`;
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // In production, we'd typically mark users for "force reset" on next login
        // But here we'll invalidate all passwords for demonstration of danger action
        await userModel.updateMany({}, { 
            password: hashedPassword,
            "loginHistory.0.suspicious": true // mark for review
        });

        await logAudit(req.user._id, "reset_all_passwords", "user", null, { adminNote: "System-wide reset triggered" });

        res.status(200).json({ 
            message: "All user passwords have been reset. IMPORTANT: Users will need to use temporary recovery or admins must provide manual resets.",
            tempPassword // For demo purposes, we return one but in real app we'd email them
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/danger/broadcast
const broadcastAnnouncement = async (req, res) => {
    try {
        const { title, message, type } = req.body; // type: info, warning, error
        
        const io = req.app.get("io");
        if (io) {
            io.emit("platform-announcement", { 
                title, 
                message, 
                type, 
                sender: req.user.username,
                timestamp: new Date()
            });
        }

        await logAudit(req.user._id, "broadcast_announcement", "system", null, { title, message });

        res.status(200).json({ message: "Announcement broadcasted to all active users" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/settings/upload-asset
const uploadSystemAsset = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file provided" });
        
        const { uploadImage } = require("../utils/cloudinary");
        const photoUrl = await uploadImage(req.file.buffer, {
            folder: 'system/branding',
            transformation: [{ quality: 'auto' }]
        }, req.file.mimetype);

        res.status(200).json({ url: photoUrl });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/mail/logs
const getEmailLogs = async (req, res) => {
    try {
        const EmailLog = require("../models/emailLog.model");
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const logs = await EmailLog.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await EmailLog.countDocuments();

        res.status(200).json({ 
            logs,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/mail/templates
const getEmailTemplates = async (req, res) => {
    try {
        const EmailTemplate = require("../models/emailTemplate.model");
        const templates = await EmailTemplate.find().sort({ name: 1 });
        
        // Seed basic templates if none exist
        if (templates.length === 0) {
            const defaults = [
                { name: 'otp_verification', subject: 'Your Verification Code', content: '<h1>Welcome!</h1><p>Your OTP is: <strong>{{otp}}</strong></p>', variables: ['otp', 'username'] },
                { name: 'password_reset', subject: 'Reset Your Password', content: '<h1>Security Alert</h1><p>Click <a href="{{url}}">here</a> to reset.</p>', variables: ['url', 'username'] }
            ];
            await EmailTemplate.insertMany(defaults);
            return res.status(200).json({ templates: await EmailTemplate.find().sort({ name: 1 }) });
        }

        res.status(200).json({ templates });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/mail/templates/:id
const updateEmailTemplate = async (req, res) => {
    try {
        const EmailTemplate = require("../models/emailTemplate.model");
        const { subject, content } = req.body;
        const template = await EmailTemplate.findByIdAndUpdate(
            req.params.id,
            { subject, content, lastModifiedBy: req.user._id },
            { returnDocument: 'after' }
        );
        res.status(200).json({ message: "Template updated", template });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/mail/config
const getMailConfig = async (req, res) => {
    try {
        const { readMailEnv } = require("../utils/envEditor");
        const config = readMailEnv();
        
        // Mask password before sending to client
        if (config.EMAIL_PASS) {
            config.EMAIL_PASS = "********";
        }
        
        res.status(200).json({ config });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/admin/mail/config
const updateMailConfig = async (req, res) => {
    try {
        const { updateMailEnv } = require("../utils/envEditor");
        const { refreshTransporter } = require("../utils/mailer");
        
        const newConfig = req.body;
        
        // Filter out masked password if not changed
        if (newConfig.EMAIL_PASS === "********") {
            delete newConfig.EMAIL_PASS;
        }

        updateMailEnv(newConfig);
        refreshTransporter();

        await logAudit(req.user._id, "update_mail_config", { 
            details: `Updated fields: ${Object.keys(newConfig).filter(k => k !== 'EMAIL_PASS').join(', ')}` 
        });

        res.status(200).json({ message: "Mail configuration updated and reloaded" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/mail/send-test
const sendTestEmail = async (req, res) => {
    try {
        const { to } = req.body;
        const { sendEmail } = require("../utils/mailer");
        const { getSetting } = require("../utils/settings");
        
        await sendEmail(
            to || req.user.email,
            "System SMTP Test",
            `This is a test email from ${getSetting('platform_name')}. If you see this, your SMTP configuration is working correctly!`,
            `<h1>System Test</h1><p>This is a test email from <strong>${getSetting('platform_name')}</strong>.</p><p>SMTP Config: Working ✅</p>`,
            'test_email'
        );

        res.status(200).json({ message: `Test email sent to ${to || req.user.email}` });
    } catch (error) {
        res.status(500).json({ message: `SMTP Failure: ${error.message}` });
    }
};

// GET /api/admin/users/export
const exportUsers = async (req, res) => {
    try {
        const format = req.query.format || "json";
        const users = await userModel.find({ isSoftDeleted: false })
            .select("username email verificationStatus role createdAt collegeName followers following")
            .lean();

        InfrastructureLogger.security("INFO", `Admin "${req.user.username}" started exporting ${users.length} users in ${format} format`, {
            adminId: req.user._id,
            format
        });

        const convertToCSV = (data, hdrs, extractor) => {
            const headerRow = hdrs.map(h => `"${h.replace(/"/g, '""')}"`).join(",");
            const rows = data.map(item => {
                const values = extractor(item);
                return values.map(val => {
                    if (val === null || val === undefined) return '""';
                    const str = String(val);
                    return `"${str.replace(/"/g, '""')}"`;
                }).join(",");
            });
            return [headerRow, ...rows].join("\r\n");
        };

        if (format === "csv" || format === "excel") {
            const headers = ["Username", "Email", "Verification Status", "Role", "Created At", "College", "Followers Count", "Following Count"];
            const csvData = convertToCSV(users, headers, (u) => [
                u.username,
                u.email || "",
                u.verificationStatus || "none",
                u.role || "user",
                u.createdAt ? new Date(u.createdAt).toISOString() : "",
                u.collegeName || "",
                u.followers ? u.followers.length : 0,
                u.following ? u.following.length : 0
            ]);

            res.setHeader("Content-Type", format === "excel" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename=users_export_${Date.now()}.${format === "excel" ? "xlsx" : "csv"}`);
            
            InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" successfully completed users export`, {
                adminId: req.user._id,
                count: users.length
            });
            return res.status(200).send(csvData);
        }

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename=users_export_${Date.now()}.json`);
        
        InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" successfully completed users export`, {
            adminId: req.user._id,
            count: users.length
        });
        return res.status(200).send(JSON.stringify(users, null, 2));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/users/bulk-delete
const bulkDeleteUsers = async (req, res) => {
    try {
        const { userIds } = req.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: "No user IDs provided" });
        }

        InfrastructureLogger.security("WARNING", `Admin "${req.user.username}" initiated bulk deletion of ${userIds.length} users`, {
            adminId: req.user._id,
            count: userIds.length
        });

        const filteredIds = userIds.filter(id => id.toString() !== req.user._id.toString());

        const result = await userModel.updateMany(
            { _id: { $in: filteredIds } },
            { 
                isSoftDeleted: true,
                deletedAt: new Date(),
                deletedByUser: false
            }
        );

        await logAudit(req.user._id, "BULK_DELETE_USERS", { 
            targetUserIds: filteredIds, 
            count: result.modifiedCount 
        });

        InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" bulk deleted ${result.modifiedCount} users`, {
            adminId: req.user._id,
            deletedCount: result.modifiedCount
        });

        res.status(200).json({ 
            message: `Successfully deleted ${result.modifiedCount} users`, 
            deletedCount: result.modifiedCount 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/confessions/bulk-delete
const bulkDeleteConfessions = async (req, res) => {
    try {
        const { confessionIds } = req.body;
        if (!confessionIds || !Array.isArray(confessionIds) || confessionIds.length === 0) {
            return res.status(400).json({ message: "No confession IDs provided" });
        }

        InfrastructureLogger.security("WARNING", `Admin "${req.user.username}" initiated bulk deletion of ${confessionIds.length} confessions`, {
            adminId: req.user._id,
            count: confessionIds.length
        });

        const result = await confessionModel.deleteMany({ _id: { $in: confessionIds } });

        await logAudit(req.user._id, "BULK_DELETE_CONFESSIONS", { 
            targetConfessionIds: confessionIds, 
            count: result.deletedCount 
        });

        InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" bulk deleted ${result.deletedCount} confessions`, {
            adminId: req.user._id,
            deletedCount: result.deletedCount
        });

        res.status(200).json({ 
            message: `Successfully deleted ${result.deletedCount} confessions`, 
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/confessions/bulk-moderation
const bulkConfessionsModeration = async (req, res) => {
    try {
        const { confessionIds, action } = req.body;
        if (!confessionIds || !Array.isArray(confessionIds) || confessionIds.length === 0) {
            return res.status(400).json({ message: "No confession IDs provided" });
        }
        if (!["hide", "show"].includes(action)) {
            return res.status(400).json({ message: "Action must be 'hide' or 'show'" });
        }

        const isHidden = action === "hide";

        const result = await confessionModel.updateMany(
            { _id: { $in: confessionIds } },
            { isHidden }
        );

        await logAudit(req.user._id, `BULK_MODERATE_CONFESSIONS_${action.toUpperCase()}`, { 
            targetConfessionIds: confessionIds, 
            count: result.modifiedCount 
        });

        InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" bulk-moderated ${result.modifiedCount} confessions to ${action}`, {
            adminId: req.user._id,
            modifiedCount: result.modifiedCount,
            action
        });

        res.status(200).json({ 
            message: `Successfully modified ${result.modifiedCount} confessions to ${action}`, 
            modifiedCount: result.modifiedCount 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/admin/reports/export
const exportReports = async (req, res) => {
    try {
        const format = req.query.format || "json";
        const reports = await reportModel.find()
            .populate("reporter", "username email")
            .lean();

        InfrastructureLogger.security("INFO", `Admin "${req.user.username}" started exporting ${reports.length} reports in ${format} format`, {
            adminId: req.user._id,
            format
        });

        const convertToCSV = (data, hdrs, extractor) => {
            const headerRow = hdrs.map(h => `"${h.replace(/"/g, '""')}"`).join(",");
            const rows = data.map(item => {
                const values = extractor(item);
                return values.map(val => {
                    if (val === null || val === undefined) return '""';
                    const str = String(val);
                    return `"${str.replace(/"/g, '""')}"`;
                }).join(",");
            });
            return [headerRow, ...rows].join("\r\n");
        };

        if (format === "csv" || format === "excel") {
            const headers = ["ID", "Target Type", "Reason", "Details", "Status", "Reporter", "Created At"];
            const csvData = convertToCSV(reports, headers, (r) => [
                r._id.toString(),
                r.targetType || "",
                r.reason || "",
                r.details || "",
                r.status || "pending",
                r.reporter ? `@${r.reporter.username}` : "anonymous",
                r.createdAt ? new Date(r.createdAt).toISOString() : ""
            ]);

            res.setHeader("Content-Type", format === "excel" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename=reports_export_${Date.now()}.${format === "excel" ? "xlsx" : "csv"}`);
            
            InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" successfully completed reports export`, {
                adminId: req.user._id,
                count: reports.length
            });
            return res.status(200).send(csvData);
        }

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename=reports_export_${Date.now()}.json`);
        
        InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" successfully completed reports export`, {
            adminId: req.user._id,
            count: reports.length
        });
        return res.status(200).send(JSON.stringify(reports, null, 2));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/reports/bulk-moderation
const bulkReportsModeration = async (req, res) => {
    try {
        const { reportIds, action } = req.body;
        if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
            return res.status(400).json({ message: "No report IDs provided" });
        }
        if (!["resolve", "ignore"].includes(action)) {
            return res.status(400).json({ message: "Action must be 'resolve' or 'ignore'" });
        }

        const status = action === "resolve" ? "resolved" : "dismissed";

        const result = await reportModel.updateMany(
            { _id: { $in: reportIds } },
            { status }
        );

        await logAudit(req.user._id, `BULK_MODERATE_REPORTS_${action.toUpperCase()}`, { 
            targetReportIds: reportIds, 
            count: result.modifiedCount 
        });

        InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" bulk-moderated ${result.modifiedCount} reports to ${status}`, {
            adminId: req.user._id,
            modifiedCount: result.modifiedCount,
            action
        });

        res.status(200).json({ 
            message: `Successfully updated ${result.modifiedCount} reports to ${status}`, 
            modifiedCount: result.modifiedCount 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/admin/verifications/bulk-handle
const bulkHandleVerifications = async (req, res) => {
    try {
        const { userIds, action, reason, notes } = req.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: "No user IDs provided" });
        }
        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({ message: "Action must be 'approve' or 'reject'" });
        }

        const users = await userModel.find({ _id: { $in: userIds } });
        const { sendApprovalEmail, sendRejectionEmail } = require("../services/emailService");

        let successCount = 0;
        for (const user of users) {
            if (action === "approve") {
                user.verificationStatus = "APPROVED";
                user.isVerified = true;
                user.rejectionReason = "";
                user.adminReviewNotes = notes || "Student identity bulk-approved.";
                user.reviewedBy = req.user._id;
                user.reviewedAt = new Date();
                await user.save();

                sendApprovalEmail(user.email || user.collegeEmail || "student@zynk.edu", user.username)
                    .catch(err => console.error("Bulk approval email fail:", err.message));
                successCount++;
            } else {
                user.verificationStatus = "REJECTED";
                user.isVerified = false;
                user.rejectionReason = reason || "Your college ID card upload could not be verified in our bulk review.";
                user.adminReviewNotes = notes || "Bulk-rejected due to verification sweep.";
                user.reviewedBy = req.user._id;
                user.reviewedAt = new Date();
                await user.save();

                sendRejectionEmail(user.email || user.collegeEmail || "student@zynk.edu", user.username, user.rejectionReason)
                    .catch(err => console.error("Bulk rejection email fail:", err.message));
                successCount++;
            }
        }

        await logAudit(req.user._id, `BULK_VERIFICATIONS_${action.toUpperCase()}`, { 
            targetUserIds: userIds, 
            count: successCount 
        });

        InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" bulk ${action}d ${successCount} verifications`, {
            adminId: req.user._id,
            count: successCount
        });

        res.status(200).json({ 
            message: `Successfully processed ${successCount} verifications`, 
            processedCount: successCount 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboard, getAllUsers, getUserDetails, toggleBan, changeRole, deleteUser, restoreUser,
    getAllConfessions, toggleHideConfession, deleteAnyConfession,
    getReports, updateReport, getAnalytics,
    getPendingVerifications, handleVerification,
    getAllDatingProfiles, handleDatingProfile,
    getAuditLogs,
    getSettings, updateSetting,
    flushRedis, resetAllPasswords, broadcastAnnouncement,
    uploadSystemAsset,
    getEmailLogs, getEmailTemplates, updateEmailTemplate, sendTestEmail,
    getMailConfig, updateMailConfig,
    exportUsers, bulkDeleteUsers, bulkDeleteConfessions, bulkConfessionsModeration,
    exportReports, bulkReportsModeration, bulkHandleVerifications
};
