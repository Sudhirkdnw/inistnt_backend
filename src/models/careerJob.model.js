const mongoose = require('mongoose');

const customFieldSchema = new mongoose.Schema({
  fieldId: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
    trim: true,
  },
  fieldType: {
    type: String,
    enum: ['text', 'textarea', 'url', 'select', 'number'],
    default: 'text',
  },
  placeholder: {
    type: String,
    default: '',
    trim: true,
  },
  options: [
    {
      type: String,
      trim: true,
    }
  ],
  required: {
    type: Boolean,
    default: false,
  },
  helperText: {
    type: String,
    default: '',
    trim: true,
  }
}, { _id: false });

const customHighlightSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true,
  },
  value: {
    type: String,
    required: true,
    trim: true,
  }
}, { _id: false });

const careerJobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: 120,
      index: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
      default: 'Engineering',
      index: true,
    },
    location: {
      type: String,
      trim: true,
      default: 'Remote (India)',
    },
    type: {
      type: String,
      enum: ['Internship', 'Full-time', 'Part-time', 'Contract'],
      default: 'Internship',
      index: true,
    },
    experience: {
      type: String,
      trim: true,
      default: 'Fresher / College Student',
    },
    salary: {
      type: String,
      trim: true,
      default: 'Competitive Stipend',
    },
    description: {
      type: String,
      required: [true, 'Job description is required'],
      trim: true,
    },
    responsibilities: [
      {
        type: String,
        trim: true,
      }
    ],
    requirements: [
      {
        type: String,
        trim: true,
      }
    ],
    perks: [
      {
        type: String,
        trim: true,
      }
    ],
    // Dynamic Custom Form Questions configured by admin
    customFields: [customFieldSchema],
    // Dynamic Highlights (e.g. Batch, Duration, Timings)
    customHighlights: [customHighlightSchema],
    applyType: {
      type: String,
      enum: ['INTERNAL_FORM', 'EXTERNAL_LINK', 'EMAIL'],
      default: 'INTERNAL_FORM',
    },
    externalLink: {
      type: String,
      trim: true,
      default: '',
    },
    contactEmail: {
      type: String,
      trim: true,
      default: 'careers@hykee.in',
    },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSED', 'DRAFT'],
      default: 'OPEN',
      index: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    applicationCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      default: null,
    },
  },
  { timestamps: true }
);

careerJobSchema.index({ status: 1, createdAt: -1 });
careerJobSchema.index({ department: 1, status: 1 });

const CareerJob = mongoose.model('CareerJob', careerJobSchema);

module.exports = CareerJob;
