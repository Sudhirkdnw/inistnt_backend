const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const cacheMiddleware = require("../middlewares/cacheMiddleware");

const {
    getUserProfile, updateProfile, updateAvatar,
    updateCover, uploadResume,
    requestEmailVerification, verifyEmail,
    toggleFollow, getFollowers, getFollowing,
    searchUsers, getSuggestions,
    requestSoftDelete, recoverAccount, hardDeleteAccount,
    acceptFollowRequest, declineFollowRequest,
    savePushToken
} = require("../controllers/user.controller");

// Search & suggestions must come before /:id to avoid conflicts
router.get("/search", authMiddleware, cacheMiddleware(60), searchUsers);
router.get("/suggestions", authMiddleware, cacheMiddleware(300), getSuggestions);
router.post("/push-token", authMiddleware, savePushToken);
router.get("/:id", authMiddleware, cacheMiddleware(60), getUserProfile);
router.put("/edit", authMiddleware, updateProfile);
router.put("/avatar", authMiddleware, upload.single("avatar"), updateAvatar);
router.put("/cover", authMiddleware, upload.single("cover"), updateCover);
router.put("/resume", authMiddleware, upload.single("resume"), uploadResume);
router.post("/:id/follow", authMiddleware, toggleFollow);
router.post("/:id/follow-request/accept", authMiddleware, acceptFollowRequest);
router.post("/:id/follow-request/decline", authMiddleware, declineFollowRequest);
router.get("/:id/followers", authMiddleware, getFollowers);
router.get("/:id/following", authMiddleware, getFollowing);

// Email Verification
router.post("/request-email-verification", authMiddleware, requestEmailVerification);
router.post("/verify-email", authMiddleware, verifyEmail);

// Soft Delete & Recovery
router.post("/request-soft-delete", authMiddleware, requestSoftDelete);
router.delete("/delete-account", authMiddleware, hardDeleteAccount);
router.post("/recover-account", recoverAccount); // Public route for recovery flow

module.exports = router;
