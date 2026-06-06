const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const {
    getConversations,
    getOrCreateDM,
    startConfessionChat,
    getMessages,
    sendMessage,
    deleteMessage,
    deleteConversation,
    likeMessage,
    markAsRead,
    contactAdmin,
    createGroupConversation,
    exitGroupConversation
} = require("../controllers/chat.controller");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

router.get("/", getConversations);
router.post("/group", createGroupConversation);
router.post("/contact-admin", contactAdmin);
router.post("/dm/:userId", getOrCreateDM);
router.post("/confession/:confessionId", startConfessionChat);
router.get("/:id/messages", getMessages);
router.post("/:id/messages", upload.single("media"), sendMessage);
router.delete("/messages/:messageId", deleteMessage);
router.post("/messages/:messageId/like", likeMessage);
router.put("/:id/read", markAsRead);
router.post("/:id/exit", exitGroupConversation);
router.delete("/:id", deleteConversation);

module.exports = router;
