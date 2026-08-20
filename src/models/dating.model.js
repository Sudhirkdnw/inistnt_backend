const mongoose = require("mongoose");

/**
 * Dating Profile Model
 * Stores a user's dating/crush profile data.
 */
const datingProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        unique: true
    },
    bio: {
        type: String,
        trim: true,
        default: ""
    },
    photos: [{
        type: String,
        trim: true
    }],
    interests: [{
        type: String,
        trim: true
    }],
    lookingFor: {
        type: String,
        enum: ["friendship", "relationship", "study-buddy", "networking"],
        default: "friendship"
    },
    gender: {
        type: String,
        trim: true,
        default: ""
    },
    preferredGender: {
        type: String,
        trim: true,
        default: ""
    },
    matches: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    isHidden: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

datingProfileSchema.index({ user: 1 });

module.exports = mongoose.model("DatingProfile", datingProfileSchema);
