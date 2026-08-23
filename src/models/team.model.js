const mongoose = require('mongoose');

const TEAM_CATEGORIES = [
  "Hackathon",
  "Startup",
  "Project",
  "Research",
  "Competition",
  "Study Group",
  "Event",
  "Sports",
  "Other"
];

const teamSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    purpose: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2500,
    },
    category: {
      type: String,
      enum: TEAM_CATEGORIES,
      required: true,
      default: "Project",
    },
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
    currentMemberCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    maxMembers: {
      type: Number,
      required: true,
      min: 2,
      max: 50,
      default: 4,
    },
    genderPreference: {
      type: String,
      enum: ['ANY', 'MALE', 'FEMALE'],
      default: 'ANY',
    },
    collegeScope: {
      type: String,
      enum: ['ALL_COLLEGES', 'SAME_COLLEGE'],
      default: 'ALL_COLLEGES',
    },
    collegeName: {
      type: String,
      default: '',
      trim: true,
    },
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'FULL', 'CLOSED', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },
    confessionPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'confession',
      default: null,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────
teamSchema.index({ status: 1, createdAt: -1 });
teamSchema.index({ category: 1, status: 1 });
teamSchema.index({ collegeScope: 1, collegeName: 1 });
teamSchema.index({ skills: 1 });
teamSchema.index({ owner: 1, status: 1 });

const Team = mongoose.model('Team', teamSchema);

module.exports = Team;
