const notificationModel = require('../models/notification.model');

const getNotifications = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const notifications = await notificationModel.find({ recipient: req.user._id })
            .select("recipient sender type title imageUrl linkUrl team confession post commentId replyId message previewText isRead createdAt")
            .populate("sender", "username fullName avatar")
            .populate("confession", "confessionText category")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await notificationModel.countDocuments({ recipient: req.user._id });

        res.status(200).json({
            notifications,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const markAllRead = async (req, res) => {
    try {
        await notificationModel.updateMany(
            { recipient: req.user._id, isRead: false },
            { isRead: true }
        );
        res.status(200).json({ message: "All notifications marked as read" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const markAsRead = async (req, res) => {
    try {
        await notificationModel.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user._id },
            { isRead: true }
        );
        res.status(200).json({ message: "Notification marked as read" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getUnreadCount = async (req, res) => {
    try {
        const count = await notificationModel.countDocuments({
            recipient: req.user._id,
            isRead: false
        });
        res.status(200).json({ unreadCount: count });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteNotification = async (req, res) => {
    try {
        const deleted = await notificationModel.findOneAndDelete({
            _id: req.params.id,
            recipient: req.user._id
        });
        if (!deleted) {
            return res.status(404).json({ message: "Notification not found" });
        }
        res.status(200).json({ success: true, message: "Notification deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const clearAllNotifications = async (req, res) => {
    try {
        await notificationModel.deleteMany({ recipient: req.user._id });
        res.status(200).json({ success: true, message: "All notifications cleared" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getNotifications, markAllRead, getUnreadCount, markAsRead, deleteNotification, clearAllNotifications };
