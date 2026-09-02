const mongoose = require('mongoose');

const customAnswerSchema = new mongoose.Schema({
  fieldId: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    default: '',
  }
}, { _id: false });

const jobApplicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CareerJob',
      required: true,
      index: true,
    },
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      default: null,
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      maxlength: 25,
    },
    college: {
      type: String,
      trim: true,
      default: '',
    },
    gradYear: {
      type: String,
      trim: true,
      default: '',
    },
    resumeUrl: {
      type: String,
      trim: true,
      default: '',
    },
    portfolioUrl: {
      type: String,
      trim: true,
      default: '',
    },
    coverNote: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    // Dynamic answers submitted for the job's custom fields
    customAnswers: [customAnswerSchema],
    status: {
      type: String,
      enum: ['PENDING', 'REVIEWING', 'SHORTLISTED', 'REJECTED', 'HIRED'],
      default: 'PENDING',
      index: true,
    },
    adminNotes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 3000,
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

// Compound index to prevent duplicate applications for same job by same email in a short period
jobApplicationSchema.index({ job: 1, email: 1 });
jobApplicationSchema.index({ job: 1, status: 1, createdAt: -1 });

const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);

module.exports = JobApplication;
