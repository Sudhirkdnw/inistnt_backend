const mockGateway = require("./mockGateway");
const stripeGateway = require("./stripeGateway");
const razorpayGateway = require("./razorpayGateway");
const playBillingGateway = require("./playBillingGateway");
const cashfreeGateway = require("./cashfreeGateway");

class GatewayFactory {
    /**
     * Resolve the active payment gateway class based on key or environment configuration
     * @param {string} [gatewayName] Gateway name Override
     * @returns {Object} Implemented gateway subclass instance
     */
    getGateway(gatewayName) {
        const activeName = (gatewayName || process.env.PAYMENT_GATEWAY || "mock").toLowerCase();

        switch (activeName) {
            case "stripe":
                return stripeGateway;
            case "razorpay":
                return razorpayGateway;
            case "cashfree":
                return cashfreeGateway;
            case "google_play":
            case "apple_store":
            case "in_app":
                return playBillingGateway;
            case "mock":
            default:
                return mockGateway;
        }
    }
}

module.exports = new GatewayFactory();
