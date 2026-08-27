const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const {
    validateReferralCode,
    getMyAmbassadorProfile,
    getMyReferredUsers
} = require("../controllers/ambassador.controller");

// Public validation route for registration flow
router.get("/validate/:code", validateReferralCode);

// Authenticated ambassador routes
router.get("/profile", authMiddleware, getMyAmbassadorProfile);
router.get("/referrals", authMiddleware, getMyReferredUsers);

module.exports = router;
