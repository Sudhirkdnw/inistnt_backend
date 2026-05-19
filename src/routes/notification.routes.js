const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");

const { getNotifications, markAllRead, getUnreadCount, markAsRead } = require("../controllers/notification.controller");

router.get("/", authMiddleware, getNotifications);
router.put("/read-all", authMiddleware, markAllRead);
router.get("/unread-count", authMiddleware, getUnreadCount);
router.put("/:id/read", authMiddleware, markAsRead);
module.exports = router;
