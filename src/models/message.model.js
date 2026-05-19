const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        conversation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
        },
        text: {
            type: String,
            required: false,
        },
        mediaUrl: {
            type: String, // Store base64 data URL
            required: false,
        },
        mediaType: {
            type: String,
            enum: ["image", "video", "audio"],
            required: false,
        },
        readBy: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "user",
            },
        ],
        likes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "user",
            },
        ],
    },
    { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────
// Chat history: fetch messages for a conversation, newest first
messageSchema.index({ conversation: 1, createdAt: -1 });
// Sender lookup within a conversation
messageSchema.index({ sender: 1, conversation: 1 });

module.exports = mongoose.model("Message", messageSchema);
