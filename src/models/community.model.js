const mongoose = require("mongoose");

const communitySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    shortDescription: {
        type: String,
        default: "",
        maxlength: 160,
        trim: true
    },
    description: {
        type: String,
        default: "",
        trim: true
    },
    category: {
        type: String,
        default: "Technology",
        trim: true
    },
    collegeName: {
        type: String,
        trim: true,
        default: ""
    },
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "College",
        default: null
    },
    isGlobal: {
        type: Boolean,
        default: false
    },
    icon: {
        type: String,
        default: ""
    },
    coverPhoto: {
        type: String,
        default: ""
    },
    rules: {
        type: String,
        default: ""
    },
    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE", "ARCHIVED"],
        default: "ACTIVE"
    },
    memberCount: {
        type: Number,
        default: 0
    },
    conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation"
    },
    isPinned: {
        type: Boolean,
        default: false
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    moderators: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }]
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────────
communitySchema.index({ collegeName: 1, status: 1 });
communitySchema.index({ status: 1, isPinned: -1, isFeatured: -1, memberCount: -1 });
communitySchema.index({ category: 1, status: 1 });
communitySchema.index({ name: "text", shortDescription: "text", description: "text" });

module.exports = mongoose.model("Community", communitySchema);
