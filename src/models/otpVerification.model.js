const mongoose = require("mongoose");

const otpVerificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    otpHash: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    resendCooldown: {
        type: Date,
        required: true
    },
    failedAttempts: {
        type: Number,
        default: 0
    },
    isVerified: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

otpVerificationSchema.index({ user: 1, createdAt: -1 });

const otpVerificationModel = mongoose.model("otpVerification", otpVerificationSchema);
module.exports = otpVerificationModel;
