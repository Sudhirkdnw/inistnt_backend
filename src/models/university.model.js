const mongoose = require("mongoose");

const universitySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

universitySchema.index({ name: 1 });

module.exports = mongoose.model("University", universitySchema);
