const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    image: {
        type: String,
        required: true
    },
    viewers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        index: { expires: 0 } // TTL index — auto-deletes when expired
    }
}, { timestamps: true });

const storyModel = mongoose.model("story", storySchema);

module.exports = storyModel;
