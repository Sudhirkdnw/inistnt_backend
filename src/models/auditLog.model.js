const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    action: {
        type: String,
        required: true
        // e.g., 'BAN_USER', 'SHADOWBAN_USER', 'DELETE_CONFESSION', 'LOCK_CONFESSION', 'APPROVE_DATING'
    },
    targetUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    targetConfession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "confession"
    },
    targetComment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "comment"
    },
    details: {
        type: String,
        default: ""
    },
    ipAddress: {
        type: String,
        default: ""
    }
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────────
// For searching logs by admin or target user efficiently
auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ targetUser: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const auditLogModel = mongoose.model("auditLog", auditLogSchema);

module.exports = auditLogModel;
