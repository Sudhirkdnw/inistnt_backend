const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    degree: {
        type: String,
        trim: true,
        default: ""
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: false,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

branchSchema.index({ name: 1 });

module.exports = mongoose.model("Branch", branchSchema);
