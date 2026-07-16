const mongoose = require("mongoose");

const communitySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        default: ""
    },
    category: {
        type: String,
        default: "General"
    },
    icon: {
        type: String,
        default: ""
    },
    coverPhoto: {
        type: String,
        default: ""
    },
    isPinned: {
        type: Boolean,
        default: false
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
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

communitySchema.index({ isPinned: -1, isFeatured: -1 });
communitySchema.index({ name: 1 });

module.exports = mongoose.model("Community", communitySchema);
