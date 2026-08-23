const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['OWNER', 'MEMBER', 'LEAD'],
      default: 'MEMBER',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'LEFT', 'REMOVED'],
      default: 'ACTIVE',
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Prevent duplicate active membership in the same team
teamMemberSchema.index({ team: 1, user: 1 }, { unique: true });
teamMemberSchema.index({ user: 1, status: 1 });

const TeamMember = mongoose.model('TeamMember', teamMemberSchema);

module.exports = TeamMember;
