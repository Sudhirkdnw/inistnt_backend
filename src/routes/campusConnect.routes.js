const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authMiddleware } = require("../middlewares/authmiddleware");
const { checkPremiumAccess } = require("../middlewares/premium.middleware");
const cacheMiddleware = require("../middlewares/cacheMiddleware");
const upload = multer({ storage: multer.memoryStorage() });

const {
    setupProfile,
    getMyProfile,
    getDiscovery,
    sendConnect,
    sendHi,
    saveProfile,
    unsaveProfile,
    passProfile,
    getConnections,
    disconnect,
    getTeamFinder,
    updateTeamListing,
    getMentors,
    toggleMentorMode,
    getBranchSkills,
    getPreferences,
    updatePreferences
} = require("../controllers/campusConnect.controller");

// All routes require authentication
router.use(authMiddleware);

// ── Profile ───────────────────────────────────────────────────────────────────
router.post("/profile", setupProfile);
router.get("/profile/me", getMyProfile);

// ── Preferences ───────────────────────────────────────────────────────────────
router.get("/preferences", getPreferences);
router.put("/preferences", updatePreferences);

// ── Discovery ─────────────────────────────────────────────────────────────────
router.get("/discovery", getDiscovery);

// ── Actions ───────────────────────────────────────────────────────────────────
router.post("/connect/:targetUserId", sendConnect);
router.post("/hi/:targetUserId", sendHi);
router.post("/save/:targetUserId", saveProfile);
router.delete("/save/:targetUserId", unsaveProfile);
router.post("/pass/:targetUserId", passProfile);
router.delete("/disconnect/:targetUserId", disconnect);

// ── Connections & Saved ───────────────────────────────────────────────────────
router.get("/connections", getConnections);

// ── Team Finder ───────────────────────────────────────────────────────────────
router.get("/team-finder", cacheMiddleware(60), getTeamFinder);
router.put("/team-listing", updateTeamListing);

// ── Mentor Mode ───────────────────────────────────────────────────────────────
router.get("/mentors", cacheMiddleware(60), getMentors);
router.put("/mentor-mode", toggleMentorMode);

// ── Branch Skills Reference ───────────────────────────────────────────────────
router.get("/branch-skills/:branch", getBranchSkills);
router.get("/branch-skills", (req, res) => {
    const { BRANCH_SKILLS } = require("../models/campusConnect.model");
    return res.status(200).json({ allBranches: Object.keys(BRANCH_SKILLS), skills: BRANCH_SKILLS });
});

module.exports = router;
