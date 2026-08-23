const mongoose = require("mongoose");

const advertisementSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    imageUrl: {
        type: String,
        required: true,
        trim: true
    },
    imagePublicId: {
        type: String,
        default: ""
    },
    destinationUrl: {
        type: String,
        trim: true,
        default: ""
    },
    startAt: {
        type: Date,
        required: true
    },
    endAt: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["ACTIVE", "PAUSED", "EXPIRED", "DRAFT"],
        default: "ACTIVE"
    },
    priority: {
        type: Number,
        default: 1,
        min: 1,
        max: 999
    },
    clicksCount: {
        type: Number,
        default: 0
    },
    impressionsCount: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// ── Indexes for high-performance home feed queries ───
advertisementSchema.index({ isDeleted: 1, status: 1, startAt: 1, endAt: 1, priority: 1 });
advertisementSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Advertisement", advertisementSchema);
