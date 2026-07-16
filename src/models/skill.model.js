const mongoose = require("mongoose");

const skillSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    branches: [{
        type: String,
        trim: true
    }],
    isApproved: {
        type: Boolean,
        default: true
    },
    isCustom: {
        type: Boolean,
        default: false
    },
    suggestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

skillSchema.index({ name: 1 });
skillSchema.index({ isApproved: 1, isActive: 1 });

module.exports = mongoose.model("Skill", skillSchema);
