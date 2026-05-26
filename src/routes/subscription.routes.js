const express = require("express");
const router = express.Router();
const { authMiddleware, softAuthMiddleware } = require("../middlewares/authmiddleware");
const {
    getActivePlans,
    purchaseSubscription,
    cancelSubscription,
    getSubscriptionStatus
} = require("../controllers/subscription.controller");

// Check status can be accessed with soft auth to determine if premium is required globally
router.get("/status", softAuthMiddleware, getSubscriptionStatus);

// Authenticated routes
router.use(authMiddleware);
router.get("/plans", getActivePlans);
router.post("/purchase", purchaseSubscription);
router.post("/cancel", cancelSubscription);

module.exports = router;
