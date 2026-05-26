const mongoose = require("mongoose");

const modulePermissionSchema = new mongoose.Schema({
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false }
}, { _id: false });

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        default: ""
    },
    permissions: {
        userManagement: { type: modulePermissionSchema, default: () => ({}) },
        reports: { type: modulePermissionSchema, default: () => ({}) },
        stories: { type: modulePermissionSchema, default: () => ({}) },
        posts: { type: modulePermissionSchema, default: () => ({}) },
        dating: { type: modulePermissionSchema, default: () => ({}) },
        premium: { type: modulePermissionSchema, default: () => ({}) },
        payments: { type: modulePermissionSchema, default: () => ({}) },
        communities: { type: modulePermissionSchema, default: () => ({}) },
        analytics: { type: modulePermissionSchema, default: () => ({}) },
        verificationRequests: { type: modulePermissionSchema, default: () => ({}) }
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        default: null
    }
}, { timestamps: true });

const roleModel = mongoose.model("role", roleSchema);
module.exports = roleModel;
