const mongoose = require("mongoose");

const verificationRequestSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true
    },
    fullName: {
        type: String,
        trim: true,
        default: ""
    },
    username: {
        type: String,
        trim: true,
        default: ""
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ""
    },
    collegeName: {
        type: String,
        trim: true,
        default: ""
    },
    branch: {
        type: String,
        trim: true,
        default: ""
    },
    semester: {
        type: Number,
        default: null
    },
    idCardImage: {
        type: String,
        required: true
    },
    idCardMetadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    status: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED"],
        default: "PENDING",
        index: true
    },
    rejectionReason: {
        type: String,
        default: ""
    },
    adminNotes: {
        type: String,
        default: ""
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    actionSource: {
        type: String,
        enum: ["ADMIN_PANEL", "EMAIL", null],
        default: null
    },
    emailActionToken: {
        type: String,
        index: true
    },
    emailActionExpiresAt: {
        type: Date
    },
    emailActionUsed: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

verificationRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("VerificationRequest", verificationRequestSchema);
