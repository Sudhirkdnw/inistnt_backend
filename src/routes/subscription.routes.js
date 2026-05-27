const express = require("express");
const router = express.Router();
const { authMiddleware, softAuthMiddleware } = require("../middlewares/authmiddleware");
const {
    getActivePlans,
    purchaseSubscription,
    cancelSubscription,
    getSubscriptionStatus,
    renderRazorpayCheckout
} = require("../controllers/subscription.controller");
const {
    handleStripeWebhook,
    handleRazorpayWebhook
} = require("../controllers/webhook.controller");

// Check status can be accessed with soft auth to determine if premium is required globally
router.get("/status", softAuthMiddleware, getSubscriptionStatus);

// Public Checkout/Web Pages
router.get("/razorpay-checkout/:subscriptionId", renderRazorpayCheckout);

// Public Webhook Endpoints
router.post("/webhook/stripe", handleStripeWebhook);
router.post("/webhook/razorpay", handleRazorpayWebhook);

// Authenticated routes
router.use(authMiddleware);
router.get("/plans", getActivePlans);
router.post("/purchase", purchaseSubscription);
router.post("/cancel", cancelSubscription);

module.exports = router;
