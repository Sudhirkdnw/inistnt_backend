const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const {
    setupProfile,
    getMyProfile,
    getDiscovery,
    swipeRight,
    swipeLeft,
    getMatches,
    unmatch,
    uploadDatingPhoto,
    deleteDatingPhoto,
    reorderDatingPhotos
} = require("../controllers/dating.controller");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

router.post("/profile", setupProfile);          // Create/update dating profile
router.get("/profile/me", getMyProfile);        // Get my dating profile
router.get("/discovery", getDiscovery);         // Get swipe stack
router.post("/like/:targetUserId", swipeRight); // Swipe right
router.post("/pass/:targetUserId", swipeLeft);  // Swipe left
router.get("/matches", getMatches);             // Get all matches
router.delete("/unmatch/:targetUserId", unmatch); // Unmatch

// Photo management
router.post("/photos", upload.single("photo"), uploadDatingPhoto);
router.delete("/photos", deleteDatingPhoto);
router.put("/photos/reorder", reorderDatingPhotos);

module.exports = router;
