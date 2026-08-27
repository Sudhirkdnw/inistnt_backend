const mongoose = require("mongoose");

const appInstallationSchema = new mongoose.Schema({
    installationId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    platform: {
        type: String,
        enum: ["android", "ios", "web", "unknown"],
        default: "unknown",
        index: true
    },
    appVersion: {
        type: String,
        trim: true,
        default: "1.0.0"
    },
    buildNumber: {
        type: String,
        trim: true,
        default: "1"
    },
    osVersion: {
        type: String,
        trim: true,
        default: ""
    },
    deviceModel: {
        type: String,
        trim: true,
        default: ""
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        default: null,
        index: true
    },
    firstSeenAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    lastSeenAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    sessionCount: {
        type: Number,
        default: 1
    }
}, { timestamps: true });

appInstallationSchema.index({ firstSeenAt: 1 });
appInstallationSchema.index({ lastSeenAt: 1 });
appInstallationSchema.index({ platform: 1, lastSeenAt: 1 });

const AppInstallation = mongoose.model("AppInstallation", appInstallationSchema);

module.exports = AppInstallation;
