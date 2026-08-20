const mongoose = require("mongoose");

const collegeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    university: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "University",
        required: true
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

collegeSchema.index({ university: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("College", collegeSchema);
