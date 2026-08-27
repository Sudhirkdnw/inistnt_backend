const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema({
    ambassador: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CampusAmbassador",
        required: true,
        index: true
    },
    ambassadorUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true
    },
    referredUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        unique: true, // A user can only ever be referred once by one ambassador
        index: true
    },
    referralCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        index: true
    },
    metadata: {
        ip: { type: String, default: "" },
        device: { type: String, default: "" },
        userAgent: { type: String, default: "" }
    }
}, { timestamps: true });

referralSchema.index({ ambassador: 1, createdAt: -1 });
referralSchema.index({ ambassadorUser: 1, createdAt: -1 });

const Referral = mongoose.model("Referral", referralSchema);

module.exports = Referral;
