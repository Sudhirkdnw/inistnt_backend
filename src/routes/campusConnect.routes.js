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
    passProfile,
    getConnections,
    disconnect,
    getTeamFinder,
    updateTeamListing,
    getMentors,
    toggleMentorMode,
    uploadCCPhoto,
    deleteCCPhoto,
    getBranchSkills
} = require("../controllers/campusConnect.controller");

// All routes require authentication
router.use(authMiddleware);
// Premium paywall check (same gate as before)
router.use(checkPremiumAccess);

// ── Profile ───────────────────────────────────────────────────────────────────
router.post("/profile", setupProfile);
router.get("/profile/me", cacheMiddleware(30), getMyProfile);

// ── Discovery ─────────────────────────────────────────────────────────────────
router.get("/discovery", cacheMiddleware(30), getDiscovery);

// ── Actions ───────────────────────────────────────────────────────────────────
router.post("/connect/:targetUserId", sendConnect);
router.post("/hi/:targetUserId", sendHi);
router.post("/save/:targetUserId", saveProfile);
router.post("/pass/:targetUserId", passProfile);
router.delete("/disconnect/:targetUserId", disconnect);

// ── Connections & Saved ───────────────────────────────────────────────────────
router.get("/connections", cacheMiddleware(30), getConnections);

// ── Team Finder ───────────────────────────────────────────────────────────────
router.get("/team-finder", cacheMiddleware(60), getTeamFinder);
router.put("/team-listing", updateTeamListing);

// ── Mentor Mode ───────────────────────────────────────────────────────────────
router.get("/mentors", cacheMiddleware(60), getMentors);
router.put("/mentor-mode", toggleMentorMode);

// ── Photos ────────────────────────────────────────────────────────────────────
router.post("/photos", upload.single("photo"), uploadCCPhoto);
router.delete("/photos", deleteCCPhoto);

// ── Branch Skills Reference ───────────────────────────────────────────────────
router.get("/branch-skills/:branch", getBranchSkills);
router.get("/branch-skills", (req, res) => {
    const { BRANCH_SKILLS } = require("../models/campusConnect.model");
    return res.status(200).json({ allBranches: Object.keys(BRANCH_SKILLS), skills: BRANCH_SKILLS });
});

module.exports = router;
