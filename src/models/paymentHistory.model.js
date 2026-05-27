const mongoose = require("mongoose");

const paymentHistorySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    subscription: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "subscription",
        default: null
    },
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "subscriptionPlan",
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        required: true,
        default: "INR"
    },
    status: {
        type: String,
        required: true,
        enum: ["pending", "completed", "failed", "refunded"],
        default: "pending"
    },
    paymentGateway: {
        type: String,
        required: true,
        enum: ["razorpay", "stripe", "google_play", "apple_store", "mock", "admin"],
        default: "mock"
    },
    gatewayTransactionId: {
        type: String,
        default: ""
    },
    gatewayResponse: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

paymentHistorySchema.index({ user: 1, createdAt: -1 });
paymentHistorySchema.index({ gatewayTransactionId: 1 });
paymentHistorySchema.index({ status: 1, createdAt: -1 });

const paymentHistoryModel = mongoose.model("paymentHistory", paymentHistorySchema);

module.exports = paymentHistoryModel;
