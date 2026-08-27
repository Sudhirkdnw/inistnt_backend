const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const { authMiddleware, softAuthMiddleware } = require("../middlewares/authmiddleware");
const communityCtrl = require("../controllers/community.controller");

// Discovery & Info
router.get("/home", softAuthMiddleware, communityCtrl.getHomeCommunities);
router.get("/", softAuthMiddleware, communityCtrl.getCommunities);
router.post("/", authMiddleware, upload.fields([{ name: 'icon', maxCount: 1 }, { name: 'coverPhoto', maxCount: 1 }]), communityCtrl.createCommunity);
router.get("/:idOrSlug", softAuthMiddleware, communityCtrl.getCommunityDetails);

// Membership actions (Require Auth)
router.post("/:id/join", authMiddleware, communityCtrl.joinCommunity);
router.post("/:id/leave", authMiddleware, communityCtrl.leaveCommunity);
router.get("/:id/members", authMiddleware, communityCtrl.getCommunityMembers);

// Group Chat Messages
router.get("/:id/messages", authMiddleware, communityCtrl.getCommunityMessages);
router.post("/:id/messages", authMiddleware, upload.single("media"), communityCtrl.sendCommunityMessage);

// Community Deletion (owner only)
router.delete("/:id", authMiddleware, communityCtrl.deleteCommunity);

module.exports = router;
