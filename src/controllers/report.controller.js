const reportModel = require("../models/report.model");
const confessionModel = require("../models/confession.model");
const commentModel = require("../models/comment.model");
const userModel = require("../models/user.model");
const datingModel = require("../models/dating.model");

/**
 * Universal report handler for confessions, comments, users, and dating profiles.
 * POST /api/reports/create
 */
const createReport = async (req, res) => {
    try {
        const { targetType, targetId, reason, description } = req.body;

        if (!targetType || !targetId || !reason) {
            return res.status(400).json({ message: "Missing required report fields" });
        }

        // Verify target exists
        let targetExists = false;
        switch (targetType) {
            case "confession":
                targetExists = await confessionModel.exists({ _id: targetId });
                break;
            case "comment":
            case "reply":
                targetExists = await commentModel.exists({ _id: targetId });
                break;
            case "user":
                targetExists = await userModel.exists({ _id: targetId });
                break;
            case "dating":
                targetExists = await datingModel.exists({ _id: targetId });
                break;
            default:
                return res.status(400).json({ message: "Invalid target type" });
        }

        if (!targetExists) {
            return res.status(404).json({ message: "Reported entity not found" });
        }

        // Check for duplicate pending report from same user
        const existing = await reportModel.findOne({
            reporter: req.user._id,
            targetId,
            status: "pending"
        });

        if (existing) {
            return res.status(400).json({ message: "You have already reported this. It is under review." });
        }

        const report = await reportModel.create({
            reporter: req.user._id,
            targetType,
            targetId,
            reason,
            description: description || ""
        });

        // Add to internal reports array if confession (optional, for legacy support)
        if (targetType === "confession") {
            await confessionModel.findByIdAndUpdate(targetId, { $addToSet: { reports: req.user._id } });
        }

        // Notify Admins via Socket.io
        const io = req.app.get("io");
        if (io) {
            const populatedReport = await reportModel.findById(report._id)
                .populate("reporter", "username fullName avatar");
            io.emit("new-report", populatedReport);
        }

        res.status(201).json({ message: "Report submitted successfully. Thank you for keeping our community safe." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createReport
};
