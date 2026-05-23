const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    confession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "confession",
        required: true
    },
    parentCommentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "comment",
        default: null
    },
    text: {
        type: String,
        required: true,
        maxlength: 1000
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    replies: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "comment"
    }],
    replyCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────────
// For fetching top-level comments or replies to a specific comment efficiently
commentSchema.index({ confession: 1, parentCommentId: 1, createdAt: -1 });
// Cursor-based pagination support for comments
commentSchema.index({ confession: 1, parentCommentId: 1, _id: -1 });

const commentModel = mongoose.model("comment", commentSchema);

module.exports = commentModel;
