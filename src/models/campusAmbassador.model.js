const mongoose = require("mongoose");

const campusAmbassadorSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        unique: true,
        index: true
    },
    referralCode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
        index: true
    },
    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE", "REVOKED"],
        default: "ACTIVE",
        index: true
    },
    college: {
        type: String,
        trim: true,
        default: ""
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        default: null
    },
    assignedAt: {
        type: Date,
        default: Date.now
    },
    deactivatedAt: {
        type: Date,
        default: null
    },
    notes: {
        type: String,
        trim: true,
        default: ""
    }
}, { timestamps: true });

campusAmbassadorSchema.index({ referralCode: 1, status: 1 });
campusAmbassadorSchema.index({ college: 1, status: 1 });

const CampusAmbassador = mongoose.model("CampusAmbassador", campusAmbassadorSchema);

module.exports = CampusAmbassador;
