const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "subscriptionPlan",
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ["active", "cancelled", "expired", "pending"],
        default: "active"
    },
    startDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },
    cancelAtPeriodEnd: {
        type: Boolean,
        default: false
    },
    paymentGateway: {
        type: String,
        required: true,
        enum: ["razorpay", "stripe", "google_play", "apple_store", "mock", "admin"],
        default: "mock"
    },
    gatewaySubscriptionId: {
        type: String,
        default: ""
    }
}, { timestamps: true });

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ endDate: 1 });

const subscriptionModel = mongoose.model("subscription", subscriptionSchema);

module.exports = subscriptionModel;
