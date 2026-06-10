const mongoose = require("mongoose");

const premiumSettingsSchema = new mongoose.Schema({
    isPremiumRequired: {
        type: Boolean,
        default: true
    },
    showMockGateway: {
        type: Boolean,
        default: true
    },
    activeGateway: {
        type: String,
        enum: ["mock", "stripe", "razorpay", "cashfree"],
        default: "mock"
    },
    enableStripeGateway: {
        type: Boolean,
        default: false
    },
    enableRazorpayGateway: {
        type: Boolean,
        default: false
    },
    enableCashfreeGateway: {
        type: Boolean,
        default: false
    },
    cashfreeAppId: {
        type: String,
        default: ""
    },
    cashfreeSecretKey: {
        type: String,
        default: ""
    },
    cashfreeSandboxMode: {
        type: Boolean,
        default: true
    },
    stripePublicKey: {
        type: String,
        default: ""
    },
    stripeSecretKey: {
        type: String,
        default: ""
    },
    stripeWebhookSecret: {
        type: String,
        default: ""
    },
    razorpayKeyId: {
        type: String,
        default: ""
    },
    razorpayKeySecret: {
        type: String,
        default: ""
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        default: null
    }
}, { timestamps: true });

const premiumSettingsModel = mongoose.model("premiumSettings", premiumSettingsSchema);

module.exports = premiumSettingsModel;
