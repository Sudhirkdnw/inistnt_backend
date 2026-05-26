const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const { checkPremiumAccess } = require("../middlewares/premium.middleware");
const cacheMiddleware = require("../middlewares/cacheMiddleware");
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
router.use(checkPremiumAccess);

router.post("/profile", setupProfile);          // Create/update dating profile
router.get("/profile/me", cacheMiddleware(30), getMyProfile);        // Get my dating profile
router.get("/discovery", cacheMiddleware(30), getDiscovery);         // Get swipe stack
router.post("/like/:targetUserId", swipeRight); // Swipe right
router.post("/pass/:targetUserId", swipeLeft);  // Swipe left
router.get("/matches", cacheMiddleware(30), getMatches);             // Get all matches
router.delete("/unmatch/:targetUserId", unmatch); // Unmatch

// Photo management
router.post("/photos", upload.single("photo"), uploadDatingPhoto);
router.delete("/photos", deleteDatingPhoto);
router.put("/photos/reorder", reorderDatingPhotos);

module.exports = router;
