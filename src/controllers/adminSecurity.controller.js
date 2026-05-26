const adminSessionModel = require("../models/adminSession.model");
const adminLoginLogModel = require("../models/adminLoginLog.model");
const otpVerificationModel = require("../models/otpVerification.model");
const auditLogModel = require("../models/auditLog.model");

const getSecuritySessions = async (req, res) => {
    try {
        const sessions = await adminSessionModel.find()
            .populate("user", "username fullName email avatar")
            .sort({ updatedAt: -1 })
            .limit(100);
        return res.status(200).json({ success: true, sessions });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const revokeSecuritySession = async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ success: false, message: "Session ID is required" });
        }

        const session = await adminSessionModel.findById(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found" });
        }

        session.isValid = false;
        await session.save();

        // Disconnect sockets for the user
        if (global.ioInstance) {
            global.ioInstance.in(`user:${session.user}`).emit("force-logout", { sessionId });
            global.ioInstance.in(`user:${session.user}`).disconnectSockets(true);
        }

        // Write an audit log for the action
        await auditLogModel.create({
            admin: req.user._id,
            action: "REVOKE_SESSION",
            targetUser: session.user,
            details: `Revoked session ${sessionId} for admin ID ${session.user}`,
            ipAddress: req.ip || req.headers["x-forwarded-for"] || ""
        });

        return res.status(200).json({ success: true, message: "Session revoked successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getSecurityDashboard = async (req, res) => {
    try {
        const loginLogs = await adminLoginLogModel.find()
            .populate("user", "username email avatar")
            .sort({ createdAt: -1 })
            .limit(50);

        const otpVerifications = await otpVerificationModel.find()
            .populate("user", "username email")
            .sort({ createdAt: -1 })
            .limit(50);

        const activeSessionsCount = await adminSessionModel.countDocuments({ isValid: true });

        // Compute stats for charts over the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const failedLoginsStats = await adminLoginLogModel.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    status: { $in: ["failed_credentials", "failed_otp"] }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const successfulLoginsStats = await adminLoginLogModel.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    status: "success"
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Merge daily counts for front-end charts
        const dailyChartData = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().slice(0, 10);
            
            const successMatch = successfulLoginsStats.find(s => s._id === dateStr);
            const failedMatch = failedLoginsStats.find(f => f._id === dateStr);

            dailyChartData.push({
                date: dateStr,
                success: successMatch ? successMatch.count : 0,
                failed: failedMatch ? failedMatch.count : 0
            });
        }

        return res.status(200).json({
            success: true,
            loginLogs,
            otpVerifications,
            activeSessionsCount,
            dailyChartData
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getSessions: getSecuritySessions,
    revokeSession: revokeSecuritySession,
    getSecurityDashboard
};
