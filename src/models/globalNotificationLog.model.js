const mongoose = require("mongoose");

const globalNotificationLogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    sentBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    totalSent: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model("GlobalNotificationLog", globalNotificationLogSchema);
