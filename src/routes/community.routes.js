const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const { authMiddleware, optionalAuth } = require("../middlewares/authmiddleware");
const communityCtrl = require("../controllers/community.controller");

// Discovery & Info
router.get("/home", optionalAuth, communityCtrl.getHomeCommunities);
router.get("/", optionalAuth, communityCtrl.getCommunities);
router.get("/:idOrSlug", optionalAuth, communityCtrl.getCommunityDetails);

// Membership actions (Require Auth)
router.post("/:id/join", authMiddleware, communityCtrl.joinCommunity);
router.post("/:id/leave", authMiddleware, communityCtrl.leaveCommunity);
router.get("/:id/members", authMiddleware, communityCtrl.getCommunityMembers);

// Group Chat Messages
router.get("/:id/messages", authMiddleware, communityCtrl.getCommunityMessages);
router.post("/:id/messages", authMiddleware, upload.single("media"), communityCtrl.sendCommunityMessage);

module.exports = router;
