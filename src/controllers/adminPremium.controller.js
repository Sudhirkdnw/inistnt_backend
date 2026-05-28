const userModel = require("../models/user.model");
const subscriptionPlanModel = require("../models/subscriptionPlan.model");
const subscriptionModel = require("../models/subscription.model");
const paymentHistoryModel = require("../models/paymentHistory.model");
const premiumSettingsModel = require("../models/premiumSettings.model");
const { invalidatePremiumSettingsCache } = require("../utils/premiumSettingsCache");

// GET /api/admin/premium/settings — Get global premium settings
async function getSettings(req, res) {
    try {
        let settings = await premiumSettingsModel.findOne();
        if (!settings) {
            settings = await premiumSettingsModel.create({
                isPremiumRequired: true,
                activeGateway: "mock",
                stripePublicKey: "",
                stripeSecretKey: "",
                stripeWebhookSecret: "",
                razorpayKeyId: "",
                razorpayKeySecret: ""
            });
        }
        
        const settingsObj = settings.toObject();
        if (settingsObj.stripeSecretKey) settingsObj.stripeSecretKey = "********";
        if (settingsObj.stripeWebhookSecret) settingsObj.stripeWebhookSecret = "********";
        if (settingsObj.razorpayKeySecret) settingsObj.razorpayKeySecret = "********";

        res.status(200).json({ settings: settingsObj });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// PUT /api/admin/premium/settings — Update global premium settings (Toggle paywall & credentials)
async function updateSettings(req, res) {
    try {
        const { 
            isPremiumRequired, 
            showMockGateway,
            activeGateway, 
            stripePublicKey, 
            stripeSecretKey, 
            stripeWebhookSecret, 
            razorpayKeyId, 
            razorpayKeySecret 
        } = req.body;

        let settings = await premiumSettingsModel.findOne();
        if (!settings) {
            settings = new premiumSettingsModel();
        }

        if (isPremiumRequired !== undefined) settings.isPremiumRequired = isPremiumRequired;
        if (showMockGateway !== undefined) settings.showMockGateway = showMockGateway;
        if (activeGateway !== undefined) settings.activeGateway = activeGateway;
        if (stripePublicKey !== undefined) settings.stripePublicKey = stripePublicKey;
        if (razorpayKeyId !== undefined) settings.razorpayKeyId = razorpayKeyId;

        if (stripeSecretKey !== undefined && stripeSecretKey !== "********") {
            settings.stripeSecretKey = stripeSecretKey;
        }
        if (stripeWebhookSecret !== undefined && stripeWebhookSecret !== "********") {
            settings.stripeWebhookSecret = stripeWebhookSecret;
        }
        if (razorpayKeySecret !== undefined && razorpayKeySecret !== "********") {
            settings.razorpayKeySecret = razorpayKeySecret;
        }

        settings.updatedBy = req.user._id;
        await settings.save();
        invalidatePremiumSettingsCache();

        const settingsObj = settings.toObject();
        if (settingsObj.stripeSecretKey) settingsObj.stripeSecretKey = "********";
        if (settingsObj.stripeWebhookSecret) settingsObj.stripeWebhookSecret = "********";
        if (settingsObj.razorpayKeySecret) settingsObj.razorpayKeySecret = "********";

        res.status(200).json({ 
            message: "Premium settings and payment gateway configurations updated successfully.", 
            settings: settingsObj 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/admin/premium/plans — Create new subscription plan
async function createPlan(req, res) {
    try {
        const { name, description, price, billingPeriod, discountPercentage, freeTrialDays } = req.body;

        if (!name || price === undefined || !billingPeriod) {
            return res.status(400).json({ message: "Name, price and billingPeriod are required" });
        }

        const plan = await subscriptionPlanModel.create({
            name,
            description,
            price,
            billingPeriod,
            discountPercentage: discountPercentage || 0,
            freeTrialDays: freeTrialDays || 0
        });

        res.status(201).json({ message: "Subscription plan created successfully", plan });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// PUT /api/admin/premium/plans/:id — Update subscription plan
async function updatePlan(req, res) {
    try {
        const { name, description, price, billingPeriod, discountPercentage, freeTrialDays, isActive } = req.body;
        const planId = req.params.id;

        const plan = await subscriptionPlanModel.findById(planId);
        if (!plan) {
            return res.status(404).json({ message: "Subscription plan not found" });
        }

        if (name !== undefined) plan.name = name;
        if (description !== undefined) plan.description = description;
        if (price !== undefined) plan.price = price;
        if (billingPeriod !== undefined) plan.billingPeriod = billingPeriod;
        if (discountPercentage !== undefined) plan.discountPercentage = discountPercentage;
        if (freeTrialDays !== undefined) plan.freeTrialDays = freeTrialDays;
        if (isActive !== undefined) plan.isActive = isActive;

        await plan.save();

        res.status(200).json({ message: "Subscription plan updated successfully", plan });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// DELETE /api/admin/premium/plans/:id — Delete plan (or deactivate if users are actively subscribed)
async function deletePlan(req, res) {
    try {
        const planId = req.params.id;

        // Check if there are active subscriptions referencing this plan
        const activeCount = await subscriptionModel.countDocuments({ 
            plan: planId, 
            status: "active" 
        });

        if (activeCount > 0) {
            // Plan has active subscribers, so soft-delete it by deactivating it
            await subscriptionPlanModel.findByIdAndUpdate(planId, { isActive: false });
            return res.status(200).json({ 
                message: "Subscription plan has active subscribers and cannot be deleted. It has been deactivated instead." 
            });
        }

        await subscriptionPlanModel.findByIdAndDelete(planId);
        res.status(200).json({ message: "Subscription plan deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/admin/premium/grant — Manually grant premium access (Promotional/Free access)
async function grantPremiumManual(req, res) {
    try {
        const { userId, days, expireAt } = req.body;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 1. Calculate expiration date based on admin input
        let premiumExpireAt = new Date();
        if (expireAt) {
            premiumExpireAt = new Date(expireAt);
        } else if (days !== undefined) {
            premiumExpireAt.setDate(premiumExpireAt.getDate() + parseInt(days));
        } else {
            return res.status(400).json({ message: "Must provide either expiration date (expireAt) or number of days" });
        }

        // 2. Fetch or create a default manual plan placeholder
        let promoPlan = await subscriptionPlanModel.findOne({ name: "Promotional Plan" });
        if (!promoPlan) {
            promoPlan = await subscriptionPlanModel.create({
                name: "Promotional Plan",
                description: "Manually granted promotional plan by Administrator",
                price: 0,
                billingPeriod: "custom",
                isActive: false // Hidden from users list
            });
        }

        // 3. Update active subscription
        await subscriptionModel.updateMany(
            { user: userId, status: "active" },
            { status: "expired" }
        );

        const subscription = await subscriptionModel.create({
            user: userId,
            plan: promoPlan._id,
            status: "active",
            startDate: new Date(),
            endDate: premiumExpireAt,
            paymentGateway: "admin",
            gatewaySubscriptionId: `admin_grant_${Date.now()}`
        });

        // 4. Update user
        user.isPremium = true;
        user.premiumExpireAt = premiumExpireAt;
        await user.save();

        // 5. Create audit transaction entry
        await paymentHistoryModel.create({
            user: userId,
            subscription: subscription._id,
            plan: promoPlan._id,
            amount: 0,
            status: "completed",
            paymentGateway: "admin",
            gatewayTransactionId: `admin_tx_${Date.now()}`,
            gatewayResponse: { grantedBy: req.user._id, reason: "Manual Administrator Promotional Grant" }
        });

        res.status(200).json({ 
            message: `Premium granted to user @${user.username} until ${premiumExpireAt.toISOString()}`,
            user,
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/admin/premium/revoke — Manually revoke premium access
async function revokePremiumManual(req, res) {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 1. Expire all active user subscriptions
        await subscriptionModel.updateMany(
            { user: userId, status: "active" },
            { status: "expired" }
        );

        // 2. Remove user premium fields
        user.isPremium = false;
        user.premiumExpireAt = null;
        await user.save();

        res.status(200).json({ 
            message: `Premium access successfully revoked for user @${user.username}`,
            user 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// GET /api/admin/premium/subscribers — Get list of active premium users
async function getSubscribers(req, res) {
    try {
        const subscriptions = await subscriptionModel.find({ status: "active" })
            .populate("user", "username fullName email avatar")
            .populate("plan", "name price billingPeriod")
            .sort({ endDate: -1 });
        res.status(200).json({ subscriptions });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// GET /api/admin/premium/analytics — Get revenue & plans distribution stats
async function getPremiumAnalytics(req, res) {
    try {
        // Aggregate total completed sales revenue
        const totalRevenueData = await paymentHistoryModel.aggregate([
            { $match: { status: "completed" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalRevenue = totalRevenueData.length > 0 ? totalRevenueData[0].total : 0;

        // Active premium subscriber counts
        const activeSubscribersCount = await subscriptionModel.countDocuments({ status: "active" });

        // Sales numbers grouped by calendar months (past 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlySales = await paymentHistoryModel.aggregate([
            { $match: { status: "completed", createdAt: { $gte: sixMonthsAgo } } },
            { 
                $group: { 
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, 
                    sales: { $sum: "$amount" },
                    transactions: { $sum: 1 }
                } 
            },
            { $sort: { _id: 1 } }
        ]);

        // Dynamic plan packages split
        const planDistribution = await subscriptionModel.aggregate([
            { $match: { status: "active" } },
            { 
                $group: { 
                    _id: "$plan", 
                    count: { $sum: 1 }
                } 
            }
        ]);
        const populatedPlans = await subscriptionPlanModel.populate(planDistribution, { path: "_id", select: "name price" });

        res.status(200).json({
            stats: {
                totalRevenue,
                activeSubscribers: activeSubscribersCount
            },
            monthlySales: monthlySales.map(m => ({ month: m._id, revenue: m.sales, txs: m.transactions })),
            planDistribution: populatedPlans.map(p => ({ name: p._id ? p._id.name : 'Unknown Plan', value: p.count }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/admin/premium/cancel-subscription — Admin cancels a user's active gateway subscription and revokes access immediately
async function cancelSubscriptionAdmin(req, res) {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Find active subscription
        const subscription = await subscriptionModel.findOne({ 
            user: userId, 
            status: "active",
            endDate: { $gt: new Date() }
        });

        if (!subscription) {
            return res.status(404).json({ message: "No active subscription found to cancel for this user" });
        }

        // 1. Cancel on the payment gateway if applicable
        if (subscription.gatewaySubscriptionId && subscription.paymentGateway !== "mock" && subscription.paymentGateway !== "admin") {
            try {
                const gatewayFactory = require("../services/payment/gatewayFactory");
                const gateway = gatewayFactory.getGateway(subscription.paymentGateway);
                await gateway.cancelSubscription(subscription.gatewaySubscriptionId);
            } catch (gatewayErr) {
                console.error("Admin Gateway cancellation error:", gatewayErr.message);
            }
        }

        // 2. Immediately expire the subscription in our database
        subscription.status = "expired";
        subscription.endDate = new Date();
        await subscription.save();

        // 3. Immediately revoke user premium status
        user.isPremium = false;
        user.premiumExpireAt = null;
        await user.save();

        res.status(200).json({
            message: `Subscription for user @${user.username} cancelled on gateway and premium access revoked immediately.`,
            subscription,
            user
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    getSettings,
    updateSettings,
    createPlan,
    updatePlan,
    deletePlan,
    grantPremiumManual,
    revokePremiumManual,
    cancelSubscriptionAdmin,
    getSubscribers,
    getPremiumAnalytics
};
