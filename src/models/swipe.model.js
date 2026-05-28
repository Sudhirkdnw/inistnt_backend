const mongoose = require("mongoose");

const swipeSchema = new mongoose.Schema(
    {
        swiper: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
        },
        swipedUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
        },
        action: {
            type: String,
            enum: ["like", "pass"],
            required: true,
        },
    },
    { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────
// Ensure a user can only swipe on another user once
swipeSchema.index({ swiper: 1, swipedUser: 1 }, { unique: true });
// Fast query for mutual match checks
swipeSchema.index({ swipedUser: 1, action: 1 });

const Swipe = mongoose.model("Swipe", swipeSchema);
module.exports = Swipe;
