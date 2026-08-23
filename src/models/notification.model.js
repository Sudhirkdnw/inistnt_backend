const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    type: {
        type: String,
        enum: [
            "like", "comment", "follow", "follow_request", "mention", "dating_match", "dating_like",
            "campus_connect_mutual", "campus_connect_request", "campus_connect_hi", "campus_connect_save", "mentor_request",
            "team_application", "team_application_accepted", "team_application_rejected"
        ],
        required: true
    },
    team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    },
    confession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "confession"
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "post"
    },
    commentId: {
        type: mongoose.Schema.Types.ObjectId
    },
    replyId: {
        type: mongoose.Schema.Types.ObjectId
    },
    message: {
        type: String
    },
    previewText: {
        type: String
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────────
// Unread count query: recipient + isRead filter, newest first
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
// Cursor-based pagination support for notification panel
notificationSchema.index({ recipient: 1, isRead: 1, _id: -1 });
// Listing query: recipient filter, newest first
notificationSchema.index({ recipient: 1, createdAt: -1 });

const notificationModel = mongoose.model("notification", notificationSchema);

module.exports = notificationModel;
