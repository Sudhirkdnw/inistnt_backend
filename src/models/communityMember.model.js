const mongoose = require("mongoose");

const communityMemberSchema = new mongoose.Schema({
    community: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Community",
        required: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true
    },
    role: {
        type: String,
        enum: ["owner", "moderator", "member"],
        default: "member"
    },
    status: {
        type: String,
        enum: ["active", "banned", "muted"],
        default: "active"
    },
    joinedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Ensure unique membership per user per community
communityMemberSchema.index({ community: 1, user: 1 }, { unique: true });
communityMemberSchema.index({ user: 1, status: 1 });
communityMemberSchema.index({ community: 1, role: 1, status: 1 });

module.exports = mongoose.model("CommunityMember", communityMemberSchema);
