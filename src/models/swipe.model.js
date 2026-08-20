const mongoose = require("mongoose");

/**
 * Swipe Model
 * Records swipe actions (like/pass) between users in the campus connect / dating feature.
 */
const swipeSchema = new mongoose.Schema({
    swiper: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    swiped: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    direction: {
        type: String,
        enum: ["like", "pass", "superlike"],
        required: true
    },
    isMatch: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

swipeSchema.index({ swiper: 1, swiped: 1 }, { unique: true });
swipeSchema.index({ swiped: 1 });

module.exports = mongoose.model("Swipe", swipeSchema);
