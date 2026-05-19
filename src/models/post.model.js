const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    text: {
        type: String,
        required: true,
        maxlength: 500
    }
}, { timestamps: true });

const postSchema = new mongoose.Schema({
    caption: {
        type: String,
        maxlength: 2200
    },
    image: {
        type: String
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    comments: [commentSchema],
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    location: {
        type: String,
        trim: true
    },
    isHidden: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────────
// Profile page: user's posts newest first
postSchema.index({ user: 1, createdAt: -1 });
// Explore feed: visible posts newest first
postSchema.index({ isHidden: 1, createdAt: -1 });
// Tag search
postSchema.index({ tags: 1 });

const postModel = mongoose.model("post", postSchema);

module.exports = postModel;