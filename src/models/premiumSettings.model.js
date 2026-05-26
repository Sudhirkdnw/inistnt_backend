const mongoose = require("mongoose");

const premiumSettingsSchema = new mongoose.Schema({
    isPremiumRequired: {
        type: Boolean,
        default: true
    },
    activeGateway: {
        type: String,
        enum: ["mock", "stripe", "razorpay"],
        default: "mock"
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
