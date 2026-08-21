const mongoose = require("mongoose");

const universitySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    city: {
        type: String,
        trim: true,
        default: ""
    },
    state: {
        type: String,
        trim: true,
        default: ""
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model("University", universitySchema);
