const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const {
    getUserProfile, updateProfile, updateAvatar,
    requestEmailVerification, verifyEmail,
    toggleFollow, getFollowers, getFollowing,
    searchUsers, getSuggestions,
    requestSoftDelete, recoverAccount
} = require("../controllers/user.controller");

// Search & suggestions must come before /:id to avoid conflicts
router.get("/search", authMiddleware, searchUsers);
router.get("/suggestions", authMiddleware, getSuggestions);
router.get("/:id", authMiddleware, getUserProfile);
router.put("/edit", authMiddleware, updateProfile);
router.put("/avatar", authMiddleware, upload.single("avatar"), updateAvatar);
router.post("/:id/follow", authMiddleware, toggleFollow);
router.get("/:id/followers", authMiddleware, getFollowers);
router.get("/:id/following", authMiddleware, getFollowing);

// Email Verification
router.post("/request-email-verification", authMiddleware, requestEmailVerification);
router.post("/verify-email", authMiddleware, verifyEmail);

// Soft Delete & Recovery
router.post("/request-soft-delete", authMiddleware, requestSoftDelete);
router.post("/recover-account", recoverAccount); // Public route for recovery flow

module.exports = router;
