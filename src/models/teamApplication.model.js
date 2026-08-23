const mongoose = require('mongoose');

const teamApplicationSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
    message: {
      type: String,
      maxlength: 600,
      default: '',
      trim: true,
    },
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
      default: 'PENDING',
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      default: null,
    },
  },
  { timestamps: true }
);

// One active application per applicant per team
teamApplicationSchema.index({ team: 1, applicant: 1 }, { unique: true });
teamApplicationSchema.index({ team: 1, status: 1, createdAt: -1 });
teamApplicationSchema.index({ applicant: 1, status: 1 });

const TeamApplication = mongoose.model('TeamApplication', teamApplicationSchema);

module.exports = TeamApplication;
