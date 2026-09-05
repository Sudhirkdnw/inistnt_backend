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
        ref: "user",
        required: true
    },
    totalSent: {
        type: Number,
        default: 0
    },
    imageUrl: {
        type: String,
        default: null
    },
    linkUrl: {
        type: String,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model("GlobalNotificationLog", globalNotificationLogSchema);
