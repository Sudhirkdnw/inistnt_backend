const mongoose = require("mongoose");

const campusConnectActionSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true
        },
        targetUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true
        },
        action: {
            type: String,
            enum: ["connect", "pass", "save", "hi"],
            required: true
        }
    },
    { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────
// Each actor can only have one action per target user
campusConnectActionSchema.index({ actor: 1, targetUser: 1 }, { unique: true });
// Fast mutual-connect checks
campusConnectActionSchema.index({ targetUser: 1, action: 1 });
// Feed queries — exclude already-acted-on profiles
campusConnectActionSchema.index({ actor: 1, action: 1 });

const CampusConnectAction = mongoose.model("CampusConnectAction", campusConnectActionSchema);
module.exports = CampusConnectAction;
