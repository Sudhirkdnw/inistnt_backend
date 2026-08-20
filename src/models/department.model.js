const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "College",
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

departmentSchema.index({ college: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Department", departmentSchema);
