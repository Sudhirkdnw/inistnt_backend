const mongoose = require("mongoose");

const collegeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    university: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "University",
        required: false,
        default: null
    },
    code: {
        type: String,
        trim: true,
        default: ""
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

collegeSchema.index({ name: 1 });

module.exports = mongoose.model("College", collegeSchema);
