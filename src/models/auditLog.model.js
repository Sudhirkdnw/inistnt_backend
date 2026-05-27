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
    },
    previousValues: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    updatedValues: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    }
}, { timestamps: true });

// Pre-hooks to prevent updating or deleting logs (immutability)
auditLogSchema.pre("save", function() {
    if (!this.isNew) {
        throw new Error("Audit logs are immutable and cannot be updated.");
    }
});

const blockUpdate = function() {
    throw new Error("Audit logs are immutable and cannot be updated.");
};

const blockDelete = function() {
    throw new Error("Audit logs are immutable and cannot be deleted.");
};

auditLogSchema.pre("updateOne", blockUpdate);
auditLogSchema.pre("updateMany", blockUpdate);
auditLogSchema.pre("findOneAndUpdate", blockUpdate);
auditLogSchema.pre("findByIdAndUpdate", blockUpdate);

auditLogSchema.pre("remove", blockDelete);
auditLogSchema.pre("deleteOne", blockDelete);
auditLogSchema.pre("deleteMany", blockDelete);
auditLogSchema.pre("findOneAndDelete", blockDelete);
auditLogSchema.pre("findOneAndRemove", blockDelete);

// ── Indexes ─────────────────────────────────────────────
// For searching logs by admin or target user efficiently
auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ targetUser: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const auditLogModel = mongoose.model("auditLog", auditLogSchema);

module.exports = auditLogModel;
