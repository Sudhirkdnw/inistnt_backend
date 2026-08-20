const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

branchSchema.index({ department: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Branch", branchSchema);
