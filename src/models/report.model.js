const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    targetType: {
        type: String,
        required: true,
        enum: ["confession", "comment", "reply", "user", "dating"]
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'targetType'
    },
    reason: {
        type: String,
        required: true,
        maxlength: 500
    },
    description: {
        type: String,
        default: "",
        maxlength: 1000
    },
    status: {
        type: String,
        enum: ["pending", "resolved", "dismissed"],
        default: "pending"
    },
    adminNote: {
        type: String,
        default: ""
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    resolvedAt: Date
}, { timestamps: true });

// Index for performance
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ createdAt: -1 }); // Added for analytics

const reportModel = mongoose.model("report", reportSchema);

module.exports = reportModel;
