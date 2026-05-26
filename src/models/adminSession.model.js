const mongoose = require("mongoose");

const adminSessionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    refreshTokenHash: {
        type: String,
        required: true,
        index: true
    },
    browser: { type: String, default: "Unknown" },
    os: { type: String, default: "Unknown" },
    device: { type: String, default: "Unknown" },
    ipAddress: { type: String, default: "" },
    location: { type: String, default: "Unknown" },
    expiresAt: { type: Date, required: true },
    isValid: { type: Boolean, default: true }
}, { timestamps: true });

adminSessionSchema.index({ user: 1 });

const adminSessionModel = mongoose.model("adminSession", adminSessionSchema);
module.exports = adminSessionModel;
