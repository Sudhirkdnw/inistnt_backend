const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    code: {
        type: String,
        trim: true,
        default: ""
    },
    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "College",
        required: false,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model("Department", departmentSchema);
