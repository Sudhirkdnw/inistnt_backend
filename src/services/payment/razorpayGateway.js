const PaymentGateway = require("./paymentGateway");
const crypto = require("crypto");
let razorpayInstance = null;

const getRazorpay = async () => {
    const premiumSettingsModel = require("../../models/premiumSettings.model");
    const settings = await premiumSettingsModel.findOne();
    const keyId = (settings && settings.razorpayKeyId) || process.env.RAZORPAY_KEY_ID;
    const keySecret = (settings && settings.razorpayKeySecret) || process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        console.warn("⚠️ Razorpay Key ID or Secret is missing in database and environment.");
        return null;
    }
    const Razorpay = require("razorpay");
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

class RazorpayGateway extends PaymentGateway {
    async createSubscription(user, plan) {
        const rzp = await getRazorpay();
        if (!rzp) {
            throw new Error("Razorpay Gateway is not configured.");
        }

        let period = "monthly";
        if (plan.billingPeriod === "weekly") period = "weekly";
        if (plan.billingPeriod === "monthly") period = "monthly";
        if (plan.billingPeriod === "yearly") period = "yearly";

        const rzpPlan = await rzp.plans.create({
            period: period,
            interval: 1,
            item: {
                name: plan.name,
                amount: Math.round(plan.price * 100), // paise
                currency: "INR",
                description: plan.description || undefined
            }
        });

        const now = Math.floor(Date.now() / 1000);
        let startAt = undefined;
        if (plan.freeTrialDays > 0) {
            startAt = now + (plan.freeTrialDays * 24 * 60 * 60);
        }

        const rzpSubscription = await rzp.subscriptions.create({
            plan_id: rzpPlan.id,
            customer_notify: 1,
            total_count: plan.billingPeriod === "yearly" ? 5 : 60,
            start_at: startAt,
            notes: {
                userId: user._id.toString(),
                planId: plan._id.toString()
            }
        });

        return {
            gateway: "razorpay",
            subscriptionId: rzpSubscription.id,
            checkoutUrl: "", 
            planName: plan.name,
            price: plan.price,
            message: "Razorpay subscription created successfully"
        };
    }

    async cancelSubscription(gatewaySubscriptionId) {
        const rzp = await getRazorpay();
        if (!rzp) {
            throw new Error("Razorpay Gateway is not configured.");
        }

        const canceled = await rzp.subscriptions.cancel(gatewaySubscriptionId, {
            cancel_at_cycle_end: 1
        });

        return {
            success: true,
            status: "cancelled",
            gatewayResponse: canceled,
            message: "Razorpay subscription set to cancel at period end"
        };
    }

    async verifyPayment(verificationData) {
        const premiumSettingsModel = require("../../models/premiumSettings.model");
        const settings = await premiumSettingsModel.findOne();
        const keySecret = (settings && settings.razorpayKeySecret) || process.env.RAZORPAY_KEY_SECRET;
        if (!keySecret) {
            throw new Error("Razorpay Key Secret is missing. Cannot verify signature.");
        }

        const { razorpayPaymentId, razorpaySubscriptionId, razorpaySignature } = verificationData;
        
        if (!razorpayPaymentId || !razorpaySubscriptionId || !razorpaySignature) {
            throw new Error("Missing parameters for Razorpay signature verification");
        }

        const generatedSignature = crypto
            .createHmac("sha256", keySecret)
            .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
            .digest("hex");

        if (generatedSignature === razorpaySignature) {
            return {
                success: true,
                transactionId: razorpayPaymentId,
                status: "completed",
                subscriptionId: razorpaySubscriptionId,
                rawResponse: verificationData
            };
        } else {
            return {
                success: false,
                transactionId: razorpayPaymentId,
                status: "failed",
                rawResponse: { error: "Signature mismatch verification failure", verificationData }
            };
        }
    }
}

module.exports = new RazorpayGateway();
