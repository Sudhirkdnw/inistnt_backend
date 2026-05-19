const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const {
    getConversations,
    getOrCreateDM,
    createGroup,
    startConfessionChat,
    getMessages,
    sendMessage,
    addGroupMember,
    removeGroupMember,
    deleteMessage,
    deleteConversation,
    likeMessage,
    markAsRead
} = require("../controllers/chat.controller");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

router.get("/", getConversations);
router.post("/dm/:userId", getOrCreateDM);
router.post("/confession/:confessionId", startConfessionChat);
router.post("/group", createGroup);
router.get("/:id/messages", getMessages);
router.post("/:id/messages", upload.single("media"), sendMessage);
router.put("/:id/members", addGroupMember);
router.delete("/:id/members/:userId", removeGroupMember);
router.delete("/messages/:messageId", deleteMessage);
router.post("/messages/:messageId/like", likeMessage);
router.put("/:id/read", markAsRead);
router.delete("/:id", deleteConversation);

module.exports = router;
