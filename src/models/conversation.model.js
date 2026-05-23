const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["dm", "group"],
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
            type: String, // Only used for group chats
        },
        admin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user", // Group creator/admin
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
