const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    fullName: {
        type: String,
        trim: true,
        default: ""
    },
    bio: {
        type: String,
        maxlength: 1000,
        default: ""
    },
    avatar: {
        type: String,
        default: ""
    },
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    followRequests: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    sentFollowRequests: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    isPrivate: {
        type: Boolean,
        default: false
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    isBanned: {
        type: Boolean,
        default: false
    },
    isShadowBanned: {
        type: Boolean,
        default: false
    },
    isMuted: {
        type: Boolean,
        default: false
    },
    muteExpiresAt: {
        type: Date,
        default: null
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    lastIp: {
        type: String,
        default: ""
    },
    loginHistory: [{
        ip: String,
        city: String,
        country: String,
        timezone: String,
        browser: String,
        os: String,
        device: String,
        userAgent: String,
        timestamp: { type: Date, default: Date.now },
        isSuspicious: { type: Boolean, default: false }
    }],
    // College verification fields
    collegeName: {
        type: String,
        trim: true,
        default: ""
    },
    collegeEmail: {
        type: String,
        trim: true,
        lowercase: true,
        default: ""
    },
    idCardImage: {
        type: String,
        default: ""
    },
    idCardMetadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    verificationMethod: {
        type: String,
        enum: ["EMAIL", "ID_CARD"],
        default: "EMAIL"
    },
    verificationStatus: {
        type: String,
        enum: ["none", "pending", "verified", "rejected", "PENDING", "APPROVED", "REJECTED", "VERIFIED"],
        default: "none"
    },
    adminReviewNotes: {
        type: String,
        default: ""
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        default: ""
    },
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpire: {
        type: Date,
        default: null
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        default: null
    },
    emailVerificationExpire: {
        type: Date,
        default: null
    },
    // Soft Delete Fields
    isSoftDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    },
    scheduledDeletionAt: {
        type: Date,
        default: null
    },
    deletedByUser: {
        type: Boolean,
        default: false // true if user deleted it, false if admin deleted it
    },
    // Premium access fields
    isPremium: {
        type: Boolean,
        default: false
    },
    premiumExpireAt: {
        type: Date,
        default: null
    },
    // Enterprise Admin Role & Permissions Settings
    adminRole: {
        type: String,
        enum: ["superadmin", "admin", "moderator", "support", "none"],
        default: "none"
    },
    roleRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "role",
        default: null
    },
    adminPermissions: {
        userManagement: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        reports: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        stories: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        posts: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        dating: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        premium: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        payments: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        communities: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        analytics: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        },
        verificationRequests: {
            view: { type: Boolean, default: false },
            create: { type: Boolean, default: false },
            update: { type: Boolean, default: false },
            delete: { type: Boolean, default: false }
        }
    },
    // Admin Secure Login OTP
    adminLoginOtp: {
        type: String,
        default: null
    },
    adminLoginOtpExpires: {
        type: Date,
        default: null
    }
}, { timestamps: true });

// Core Auth & Identity
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ collegeEmail: 1 }, { sparse: true });

// Status & Filtering
userSchema.index({ isSoftDeleted: 1, isBanned: 1 });
userSchema.index({ verificationStatus: 1, createdAt: -1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ fullName: 1 });
userSchema.index({ collegeName: 1 });

// Text Search
userSchema.index({ username: 'text', fullName: 'text' });

// Compound Admin Queries
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ collegeName: 1, verificationStatus: 1 });
userSchema.index({ createdAt: -1 }); // Added for analytics
userSchema.index({ verificationStatus: 1 }); // Added for dashboard queries
userSchema.index({ isPremium: 1, premiumExpireAt: 1 }); // Added for fast premium checks

const userModel = mongoose.model("user", userSchema);

module.exports = userModel;