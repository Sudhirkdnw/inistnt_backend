const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    otp: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300, // Document will automatically delete after 5 minutes (300 seconds)
    }
});

const otpModel = mongoose.model("otp", otpSchema);

module.exports = otpModel;
