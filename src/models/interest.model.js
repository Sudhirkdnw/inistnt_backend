const mongoose = require("mongoose");

const interestSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    category: {
        type: String,
        default: "General"
    },
    isApproved: {
        type: Boolean,
        default: true
    },
    isCustom: {
        type: Boolean,
        default: false
    },
    suggestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

interestSchema.index({ name: 1 });
interestSchema.index({ isApproved: 1, isActive: 1 });

module.exports = mongoose.model("Interest", interestSchema);
