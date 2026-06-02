const express = require("express");
const router = express.Router();
const { authMiddleware, softAuthMiddleware } = require("../middlewares/authmiddleware");
const {
    getActivePlans,
    purchaseSubscription,
    cancelSubscription,
    getSubscriptionStatus,
    renderRazorpayCheckout,
    renderCashfreeCheckout,
    renderCashfreeVerify
} = require("../controllers/subscription.controller");
const {
    handleStripeWebhook,
    handleRazorpayWebhook
} = require("../controllers/webhook.controller");

// Check status can be accessed with soft auth to determine if premium is required globally
router.get("/status", softAuthMiddleware, getSubscriptionStatus);

// Public Checkout/Web Pages
router.get("/razorpay-checkout/:subscriptionId", renderRazorpayCheckout);
router.get("/cashfree-checkout/:orderId", renderCashfreeCheckout);
router.get("/cashfree-verify", renderCashfreeVerify);

// Public Webhook Endpoints
router.post("/webhook/stripe", handleStripeWebhook);
router.post("/webhook/razorpay", handleRazorpayWebhook);

// Authenticated routes
router.use(authMiddleware);
router.get("/plans", getActivePlans);
router.post("/purchase", purchaseSubscription);
router.post("/cancel", cancelSubscription);

module.exports = router;
