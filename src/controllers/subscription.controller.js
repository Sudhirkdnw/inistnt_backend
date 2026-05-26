const userModel = require("../models/user.model");
const subscriptionPlanModel = require("../models/subscriptionPlan.model");
const subscriptionModel = require("../models/subscription.model");
const paymentHistoryModel = require("../models/paymentHistory.model");
const premiumSettingsModel = require("../models/premiumSettings.model");
const gatewayFactory = require("../services/payment/gatewayFactory");

// GET /api/subscriptions/plans — Get all active premium plans
async function getActivePlans(req, res) {
    try {
        const plans = await subscriptionPlanModel.find({ isActive: true });
        res.status(200).json({ plans });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/subscriptions/purchase — Initiate purchase OR verify payment details
async function purchaseSubscription(req, res) {
    try {
        const { planId, gateway: reqGateway, paymentDetails } = req.body;
        const userId = req.user._id;

        if (!planId) {
            return res.status(400).json({ message: "Plan ID is required" });
        }

        const plan = await subscriptionPlanModel.findById(planId);
        if (!plan || !plan.isActive) {
            return res.status(404).json({ message: "Active subscription plan not found" });
        }

        // 1. Prevent duplicate active subscriptions
        const existingSub = await subscriptionModel.findOne({ 
            user: userId, 
            status: "active",
            endDate: { $gt: new Date() }
        });
        if (existingSub) {
            return res.status(400).json({ 
                message: "You already have an active subscription.", 
                subscription: existingSub 
            });
        }

        let gatewayName = reqGateway;
        if (!gatewayName) {
            const settings = await premiumSettingsModel.findOne();
            gatewayName = settings ? settings.activeGateway : (process.env.PAYMENT_GATEWAY || "mock");
        }
        const gateway = gatewayFactory.getGateway(gatewayName);

        // CASE A: Initializing subscription checkout (no payment verification details provided yet)
        if (!paymentDetails) {
            const checkoutData = await gateway.createSubscription(req.user, plan);
            return res.status(200).json({
                message: "Checkout session initialized",
                ...checkoutData
            });
        }

        // CASE B: Verifying payment checkout response (signature/receipt/transaction verification)
        const verification = await gateway.verifyPayment(paymentDetails);
        if (!verification.success) {
            return res.status(400).json({ message: "Payment verification failed" });
        }

        // 2. Prevent payment spoofing / duplicate transaction claims
        const duplicateTx = await paymentHistoryModel.findOne({ 
            gatewayTransactionId: verification.transactionId,
            status: "completed"
        });
        if (duplicateTx) {
            return res.status(409).json({ message: "This transaction has already been processed." });
        }

        // 3. Compute subscription dates
        const startDate = new Date();
        const endDate = new Date();
        
        let daysToAdd = plan.freeTrialDays || 0;
        if (plan.billingPeriod === "weekly") daysToAdd += 7;
        else if (plan.billingPeriod === "monthly") daysToAdd += 30;
        else if (plan.billingPeriod === "yearly") daysToAdd += 365;
        else daysToAdd += 30; // default backup

        endDate.setDate(endDate.getDate() + daysToAdd);

        // 4. Save User Subscription record
        const subscription = await subscriptionModel.create({
            user: userId,
            plan: planId,
            status: "active",
            startDate,
            endDate,
            paymentGateway: gatewayName,
            gatewaySubscriptionId: verification.subscriptionId || ""
        });

        // 5. Update User Document premium values
        await userModel.findByIdAndUpdate(userId, {
            isPremium: true,
            premiumExpireAt: endDate
        });

        // 6. Record payment history audit log
        await paymentHistoryModel.create({
            user: userId,
            subscription: subscription._id,
            plan: planId,
            amount: plan.price,
            status: "completed",
            paymentGateway: gatewayName,
            gatewayTransactionId: verification.transactionId,
            gatewayResponse: verification.rawResponse
        });

        res.status(200).json({
            message: "Subscription purchased successfully!",
            subscription,
            isPremium: true,
            premiumExpireAt: endDate
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/subscriptions/cancel — Cancel active subscription auto-renew
async function cancelSubscription(req, res) {
    try {
        const userId = req.user._id;

        // Find active subscription
        const subscription = await subscriptionModel.findOne({ 
            user: userId, 
            status: "active",
            endDate: { $gt: new Date() }
        });

        if (!subscription) {
            return res.status(404).json({ message: "No active subscription found to cancel" });
        }

        if (subscription.gatewaySubscriptionId && subscription.paymentGateway !== "mock") {
            try {
                const gateway = gatewayFactory.getGateway(subscription.paymentGateway);
                await gateway.cancelSubscription(subscription.gatewaySubscriptionId);
            } catch (gatewayErr) {
                console.error("Gateway cancellation error:", gatewayErr.message);
            }
        }

        // Set status to cancelled (which keeps premium access active until endDate, but disables auto-renew)
        subscription.status = "cancelled";
        subscription.cancelAtPeriodEnd = true;
        await subscription.save();

        res.status(200).json({
            message: "Subscription cancelled successfully. You will remain premium until the end of your billing cycle.",
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// GET /api/subscriptions/status — Fetch current user's subscription details and global toggles
async function getSubscriptionStatus(req, res) {
    try {
        const userId = req.user ? req.user._id : null;

        // 1. Get global settings
        let settings = await premiumSettingsModel.findOne();
        const isPremiumRequired = settings ? settings.isPremiumRequired : true;

        if (!userId) {
            return res.status(200).json({
                isPremiumRequired,
                isPremium: false,
                premiumExpireAt: null,
                subscription: null
            });
        }

        // 2. Fetch user details and active subscription
        const user = await userModel.findById(userId).select("isPremium premiumExpireAt");
        
        const now = new Date();
        const isPremium = user.isPremium && user.premiumExpireAt && new Date(user.premiumExpireAt) > now;

        const subscription = await subscriptionModel.findOne({ 
            user: userId, 
            status: { $in: ["active", "cancelled"] },
            endDate: { $gt: now }
        }).populate("plan", "name price billingPeriod");

        res.status(200).json({
            isPremiumRequired,
            isPremium: !!isPremium,
            premiumExpireAt: user.premiumExpireAt,
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    getActivePlans,
    purchaseSubscription,
    cancelSubscription,
    getSubscriptionStatus
};
