const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");

const { getNotifications, markAllRead, getUnreadCount, markAsRead, deleteNotification, clearAllNotifications } = require("../controllers/notification.controller");

router.get("/", authMiddleware, getNotifications);
router.put("/read-all", authMiddleware, markAllRead);
router.delete("/clear-all", authMiddleware, clearAllNotifications);
router.get("/unread-count", authMiddleware, getUnreadCount);
router.put("/:id/read", authMiddleware, markAsRead);
router.delete("/:id", authMiddleware, deleteNotification);
module.exports = router;
