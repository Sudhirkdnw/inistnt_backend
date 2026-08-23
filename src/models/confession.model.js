const mongoose = require('mongoose');

const CONFESSION_CATEGORIES = ["crush", "love", "study", "funny", "secret", "advice", "other"];



const confessionSchema = new mongoose.Schema({
    confessionText: {
        type: String,
        required: true,
        maxlength: 2200
    },
    category: {
        type: String,
        enum: CONFESSION_CATEGORIES,
        required: true,
        default: "secret"
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    isAnonymous: {
        type: Boolean,
        default: true
    },
    collegeName: {
        type: String,
        default: ""
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    commentCount: {
        type: Number,
        default: 0
    },
    reports: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    isHidden: {
        type: Boolean,
        default: false
    },
    isLocked: {
        type: Boolean,
        default: false
    },
    isPinned: {
        type: Boolean,
        default: false
    },
    isNSFW: {
        type: Boolean,
        default: false
    },
    postType: {
        type: String,
        enum: ["TEXT", "PHOTO", "TEAM_RECRUITMENT"],
        default: "TEXT",
        index: true
    },
    team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
        default: null,
        index: true
    },
    media: [{
        url: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            default: ""
        },
        width: {
            type: Number,
            default: 0
        },
        height: {
            type: Number,
            default: 0
        }
    }],
    isPremiumPost: {
        type: Boolean,
        default: false,
        index: true
    },
    mediaStatus: {
        type: String,
        enum: ["ACTIVE", "EXPIRED", "DELETED"],
        default: "ACTIVE",
        index: true
    },
    mediaExpireAt: {
        type: Date,
        default: null,
        index: true
    },
    poll: {
        options: [{
            text: {
                type: String,
                required: true
            },
            votes: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: "user"
            }]
        }]
    }
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────────
// Core Feed Performance
confessionSchema.index({ collegeName: 1, isHidden: 1, _id: -1 });
confessionSchema.index({ isHidden: 1, createdAt: -1 });
confessionSchema.index({ category: 1, isHidden: 1, createdAt: -1 });
confessionSchema.index({ user: 1, createdAt: -1 });

// Photo & Expiry Indexes
confessionSchema.index({ isPremiumPost: 1, mediaStatus: 1, mediaExpireAt: 1 });
confessionSchema.index({ user: 1, isPremiumPost: 1 });
confessionSchema.index({ postType: 1, isHidden: 1, createdAt: -1 });

// Cursor Pagination Optimization
confessionSchema.index({ isHidden: 1, _id: -1 });
confessionSchema.index({ user: 1, isHidden: 1, _id: -1 });

// Search & Analytics
confessionSchema.index({ confessionText: 'text' });
confessionSchema.index({ isNSFW: 1, isHidden: 1 });
confessionSchema.index({ reports: 1 }, { sparse: true });
confessionSchema.index({ createdAt: -1 }); // Added for analytics
confessionSchema.index({ isHidden: 1, commentCount: -1 }); // For hot posts aggregation sort

const confessionModel = mongoose.model("confession", confessionSchema);

module.exports = confessionModel;
module.exports.CONFESSION_CATEGORIES = CONFESSION_CATEGORIES;
