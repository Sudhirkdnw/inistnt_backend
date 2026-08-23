const mongoose = require("mongoose");

const collegeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    // Admin-only metadata — not shown to users; kept for internal grouping only
    // @deprecated-link — University FK no longer required or enforced
    university: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "University",
        required: false,
        default: null
    },
    // Admin metadata: type of institution (optional, user-facing label is always "College")
    instituteType: {
        type: String,
        enum: ["college", "university", "institute", "deemed", "autonomous", "other"],
        default: "college"
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

collegeSchema.index({ isActive: 1, name: 1 });
collegeSchema.index({ name: 1, isActive: 1 });
collegeSchema.index({ name: "text", city: "text", state: "text" });

module.exports = mongoose.model("College", collegeSchema);
