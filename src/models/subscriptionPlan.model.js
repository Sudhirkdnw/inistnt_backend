const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ""
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    billingPeriod: {
        type: String,
        required: true,
        enum: ["weekly", "monthly", "yearly", "custom"],
        default: "monthly"
    },
    discountPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    freeTrialDays: {
        type: Number,
        default: 0,
        min: 0
    },
    stripeProductId: {
        type: String,
        default: ""
    },
    stripePriceId: {
        type: String,
        default: ""
    },
    razorpayPlanId: {
        type: String,
        default: ""
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

subscriptionPlanSchema.index({ isActive: 1 });

const subscriptionPlanModel = mongoose.model("subscriptionPlan", subscriptionPlanSchema);

module.exports = subscriptionPlanModel;
