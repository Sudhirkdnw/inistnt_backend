const mongoose = require("mongoose");

const adminLoginLogSchema = new mongoose.Schema({
    username: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    status: {
        type: String,
        enum: ["success", "failed_credentials", "failed_otp"],
        required: true
    },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    location: { type: String, default: "Unknown" },
    failureReason: { type: String, default: "" }
}, { timestamps: true });

adminLoginLogSchema.index({ username: 1, createdAt: -1 });
adminLoginLogSchema.index({ status: 1, createdAt: -1 });

const adminLoginLogModel = mongoose.model("adminLoginLog", adminLoginLogSchema);
module.exports = adminLoginLogModel;
