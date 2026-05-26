const PaymentGateway = require("./paymentGateway");

class PlayBillingGateway extends PaymentGateway {
    async createSubscription(user, plan) {
        return {
            gateway: "google_play",
            subscriptionId: `google_play_init_${Date.now()}`,
            checkoutUrl: "",
            message: "App Store / Google Play In-App purchase must be initiated on mobile client"
        };
    }

    async cancelSubscription(gatewaySubscriptionId) {
        return {
            success: true,
            status: "cancelled",
            message: "Subscription cancellation must be performed by the user inside App Store or Google Play Store settings."
        };
    }

    async verifyPayment(verificationData) {
        const { purchaseToken, subscriptionId } = verificationData;

        if (!purchaseToken || !subscriptionId) {
            throw new Error("Google Play purchaseToken and subscriptionId are required for receipt verification");
        }

        return {
            success: true,
            transactionId: purchaseToken,
            status: "completed",
            subscriptionId: subscriptionId,
            rawResponse: { verificationData, verifiedAt: new Date(), gateway: "google_play" }
        };
    }
}

module.exports = new PlayBillingGateway();
