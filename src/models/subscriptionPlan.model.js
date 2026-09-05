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
        enum: ["daily", "weekly", "monthly", "quarterly", "yearly", "custom", "lifetime"],
        default: "monthly"
    },
    durationDays: {
        type: Number,
        default: 30,
        min: 1
    },
    originalPrice: {
        type: Number,
        default: 0,
        min: 0
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
    // Quotas & Feature Entitlements
    maxPhotosPerPost: {
        type: Number,
        default: 6,
        min: 1
    },
    dailyPhotoPostLimit: {
        type: Number,
        default: 10, // 0 for unlimited
        min: 0
    },
    campusConnectDailyLimit: {
        type: Number,
        default: 50, // 0 for unlimited
        min: 0
    },
    directChatDailyLimit: {
        type: Number,
        default: 30, // 0 for unlimited
        min: 0
    },
    features: {
        type: [String],
        default: ["Unlock all feed photos", "VIP Gold Badge", "Campus Connect Match Boost", "Ad-free experience"]
    },
    isPopular: {
        type: Boolean,
        default: false
    },
    badgeText: {
        type: String,
        trim: true,
        default: ""
    },
    colorTheme: {
        type: String,
        enum: ["gold", "purple", "emerald", "blue", "rose"],
        default: "gold"
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
