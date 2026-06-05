const mongoose = require('mongoose');

const CONFESSION_CATEGORIES = ["crush", "love", "study", "funny", "secret", "advice"];



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

// Cursor Pagination Optimization
confessionSchema.index({ isHidden: 1, _id: -1 });
confessionSchema.index({ user: 1, isHidden: 1, _id: -1 });

// Search & Analytics
confessionSchema.index({ confessionText: 'text' });
confessionSchema.index({ isNSFW: 1, isHidden: 1 });
confessionSchema.index({ reports: 1 }, { sparse: true });
confessionSchema.index({ createdAt: -1 }); // Added for analytics

const confessionModel = mongoose.model("confession", confessionSchema);

module.exports = confessionModel;
module.exports.CONFESSION_CATEGORIES = CONFESSION_CATEGORIES;
