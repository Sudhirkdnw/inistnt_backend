const crypto = require("crypto");
const stripeGateway = require("../services/payment/stripeGateway");
const razorpayGateway = require("../services/payment/razorpayGateway");
const userModel = require("../models/user.model");
const subscriptionPlanModel = require("../models/subscriptionPlan.model");
const subscriptionModel = require("../models/subscription.model");
const paymentHistoryModel = require("../models/paymentHistory.model");

/**
 * Handle Stripe Webhook Events
 */
async function handleStripeWebhook(req, res) {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
        return res.status(400).json({ message: "Stripe signature header is missing" });
    }

    let event;
    try {
        event = await stripeGateway.verifyWebhook(req.rawBody, signature);
    } catch (err) {
        console.error("❌ [Stripe Webhook] Verification failed:", err.message);
        return res.status(400).json({ message: `Webhook verification failed: ${err.message}` });
    }

    try {
        console.log(`🔔 [Stripe Webhook] Received event: ${event.type}`);

        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            const { userId, planId } = session.metadata || {};

            if (userId && planId) {
                await activatePremium({
                    userId,
                    planId,
                    gateway: "stripe",
                    gatewaySubscriptionId: session.subscription || "",
                    gatewayTransactionId: session.payment_intent || session.id,
                    rawResponse: session
                });
            }
        } else if (event.type === "invoice.payment_succeeded") {
            const invoice = event.data.object;
            const subscriptionId = invoice.subscription;
            
            if (subscriptionId) {
                const existingSub = await subscriptionModel.findOne({ gatewaySubscriptionId: subscriptionId });
                if (existingSub) {
                    await activatePremium({
                        userId: existingSub.user,
                        planId: existingSub.plan,
                        gateway: "stripe",
                        gatewaySubscriptionId: subscriptionId,
                        gatewayTransactionId: invoice.payment_intent || invoice.id,
                        rawResponse: invoice
                    });
                }
            }
        } else if (event.type === "customer.subscription.deleted") {
            const subscriptionObj = event.data.object;
            const subscriptionId = subscriptionObj.id;

            if (subscriptionId) {
                await revokePremium(subscriptionId);
            }
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error("❌ [Stripe Webhook] Processing error:", error.message);
        res.status(500).json({ message: error.message });
    }
}

/**
 * Handle Razorpay Webhook Events
 */
async function handleRazorpayWebhook(req, res) {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
        return res.status(400).json({ message: "Razorpay signature header is missing" });
    }

    let isValid = false;
    try {
        isValid = await razorpayGateway.verifyWebhook(req.rawBody, signature);
    } catch (err) {
        console.error("❌ [Razorpay Webhook] Verification failed:", err.message);
        return res.status(400).json({ message: `Webhook verification error: ${err.message}` });
    }

    if (!isValid) {
        console.warn("⚠️ [Razorpay Webhook] Signature mismatch");
        return res.status(400).json({ message: "Invalid signature verification" });
    }

    try {
        const payload = req.body;
        console.log(`🔔 [Razorpay Webhook] Received event: ${payload.event}`);

        if (payload.event === "subscription.charged") {
            const subEntity = payload.payload.subscription.entity;
            const paymentEntity = payload.payload.payment.entity;
            const { userId, planId } = subEntity.notes || {};

            if (userId && planId) {
                await activatePremium({
                    userId,
                    planId,
                    gateway: "razorpay",
                    gatewaySubscriptionId: subEntity.id,
                    gatewayTransactionId: paymentEntity.id,
                    rawResponse: payload
                });
            }
        } else if (payload.event === "subscription.cancelled" || payload.event === "subscription.halted") {
            const subEntity = payload.payload.subscription.entity;
            if (subEntity && subEntity.id) {
                await revokePremium(subEntity.id);
            }
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error("❌ [Razorpay Webhook] Processing error:", error.message);
        res.status(500).json({ message: error.message });
    }
}

/**
 * Helper to activate/renew premium membership in DB
 */
async function activatePremium({ userId, planId, gateway, gatewaySubscriptionId, gatewayTransactionId, rawResponse }) {
    // Prevent duplicate transaction processing
    const duplicateTx = await paymentHistoryModel.findOne({ 
        gatewayTransactionId,
        status: "completed"
    });
    if (duplicateTx) {
        console.log(`ℹ️ [Payment Webhook] Transaction ${gatewayTransactionId} already processed.`);
        return;
    }

    const plan = await subscriptionPlanModel.findById(planId);
    if (!plan) {
        throw new Error(`Plan ${planId} not found`);
    }

    const startDate = new Date();
    const endDate = new Date();
    
    let daysToAdd = plan.freeTrialDays || 0;
    if (plan.billingPeriod === "weekly") daysToAdd += 7;
    else if (plan.billingPeriod === "monthly") daysToAdd += 30;
    else if (plan.billingPeriod === "yearly") daysToAdd += 365;
    else daysToAdd += 30;

    endDate.setDate(endDate.getDate() + daysToAdd);

    // Save/Update User Subscription record
    let subscription = await subscriptionModel.findOne({ 
        user: userId, 
        gatewaySubscriptionId,
        status: "active" 
    });

    if (subscription) {
        subscription.endDate = endDate;
        await subscription.save();
    } else {
        // Expire older active subscriptions first
        await subscriptionModel.updateMany(
            { user: userId, status: "active" },
            { status: "expired" }
        );

        subscription = await subscriptionModel.create({
            user: userId,
            plan: planId,
            status: "active",
            startDate,
            endDate,
            paymentGateway: gateway,
            gatewaySubscriptionId
        });
    }

    // Update User Document
    const updatedUser = await userModel.findByIdAndUpdate(userId, {
        isPremium: true,
        premiumExpireAt: endDate
    }, { returnDocument: 'after' });

    // Record payment history
    await paymentHistoryModel.create({
        user: userId,
        subscription: subscription._id,
        plan: planId,
        amount: plan.price,
        status: "completed",
        paymentGateway: gateway,
        gatewayTransactionId,
        gatewayResponse: rawResponse
    });

    // Send billing confirmation email
    try {
        const targetEmail = updatedUser.collegeEmail || updatedUser.email;
        if (targetEmail) {
            const emailService = require("../services/email");
            await emailService.sendBillingEmail(targetEmail, updatedUser.fullName || updatedUser.username, {
                planName: plan.name,
                amount: plan.price,
                gateway,
                transactionId: gatewayTransactionId,
                date: startDate.toLocaleDateString(),
                expiryDate: endDate.toLocaleDateString()
            });
            console.log(`✉️ [Payment Webhook] Billing confirmation email sent to ${targetEmail}`);
        } else {
            console.warn(`⚠️ [Payment Webhook] User ${userId} has no email address configured.`);
        }
    } catch (emailErr) {
        console.error("❌ [Payment Webhook] Failed to send billing email:", emailErr.message);
    }

    console.log(`✅ [Payment Webhook] Activated/Renewed premium for user ${userId} until ${endDate}`);
}

/**
 * Helper to revoke premium membership in DB
 */
async function revokePremium(gatewaySubscriptionId) {
    const subscriptions = await subscriptionModel.find({ gatewaySubscriptionId });
    if (subscriptions.length === 0) {
        console.log(`ℹ️ [Payment Webhook] No active subscription found for gateway ID ${gatewaySubscriptionId}`);
        return;
    }

    for (const sub of subscriptions) {
        sub.status = "expired";
        await sub.save();

        // Check if user has any other active subscriptions
        const otherActive = await subscriptionModel.findOne({
            user: sub.user,
            status: "active",
            endDate: { $gt: new Date() }
        });

        if (!otherActive) {
            await userModel.findByIdAndUpdate(sub.user, {
                isPremium: false,
                premiumExpireAt: null
            });
            console.log(`❌ [Payment Webhook] Revoked premium for user ${sub.user}`);
        }
    }
}

module.exports = {
    handleStripeWebhook,
    handleRazorpayWebhook
};
