const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["dm", "group", "community", "team"],
            required: true,
            default: "dm",
        },
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "user",
            },
        ],
        name: {
            type: String, // Only used for group/community/team chats
        },
        admin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user", // Group creator/admin
        },
        communityId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Community",
            index: true
        },
        teamId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team",
            index: true
        },
        lastMessage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
        },
        isAnonymousChat: {
            type: Boolean,
            default: false
        },
        anonymousIdentities: {
            type: Map,
            of: String // Maps userId -> "Anonymous Fox"
        },
        confessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "confession"
        }
    },
    { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────
// Faster Inbox queries: Fetching conversations for a user, sorted by newest update
conversationSchema.index({ participants: 1, updatedAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
