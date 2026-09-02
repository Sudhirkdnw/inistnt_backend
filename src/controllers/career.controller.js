const CareerJob = require('../models/careerJob.model');
const JobApplication = require('../models/jobApplication.model');

// ==========================================
// PUBLIC CONTROLLERS (Client Website)
// ==========================================

/**
 * GET /api/careers
 * Fetch active OPEN jobs for public listing
 */
exports.getPublicJobs = async (req, res) => {
  try {
    const { department, type, search } = req.query;

    const query = { status: 'OPEN' };

    if (department && department !== 'All') {
      query.department = new RegExp(`^${department}$`, 'i');
    }

    if (type && type !== 'All') {
      query.type = type;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: regex },
        { department: regex },
        { location: regex },
        { description: regex },
        { requirements: regex },
      ];
    }

    const jobs = await CareerJob.find(query)
      .sort({ featured: -1, createdAt: -1 })
      .select('-__v');

    // Get unique departments for frontend filters
    const allActiveJobs = await CareerJob.find({ status: 'OPEN' }).select('department type');
    const departments = Array.from(new Set(allActiveJobs.map((j) => j.department).filter(Boolean)));
    const types = Array.from(new Set(allActiveJobs.map((j) => j.type).filter(Boolean)));

    return res.status(200).json({
      success: true,
      count: jobs.length,
      departments,
      types,
      jobs,
    });
  } catch (error) {
    console.error('[Career API] Error getting public jobs:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch job openings' });
  }
};

/**
 * GET /api/careers/:id
 * Fetch single job details for public view & application modal
 */
exports.getPublicJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await CareerJob.findById(id).select('-__v');

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job opening not found' });
    }

    return res.status(200).json({
      success: true,
      job,
    });
  } catch (error) {
    console.error('[Career API] Error fetching job by id:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch job details' });
  }
};

/**
 * POST /api/careers/:id/apply
 * Submit job application with standard fields and dynamic customAnswers
 */
exports.applyForJob = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      email,
      phone,
      college,
      gradYear,
      resumeUrl,
      portfolioUrl,
      coverNote,
      customAnswers,
    } = req.body;

    const job = await CareerJob.findById(id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job opening not found' });
    }

    if (job.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'This job opening is no longer accepting applications',
      });
    }

    // Required fields check
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    // Validate dynamic required customFields
    if (Array.isArray(job.customFields) && job.customFields.length > 0) {
      for (const field of job.customFields) {
        if (field.required) {
          const ans = (customAnswers || []).find((a) => a.fieldId === field.fieldId);
          if (!ans || ans.value === undefined || ans.value === null || String(ans.value).trim() === '') {
            return res.status(400).json({
              success: false,
              message: `Please fill in the required field: "${field.label}"`,
            });
          }
        }
      }
    }

    // Check if duplicate submission within last 24h
    const existing = await JobApplication.findOne({
      job: id,
      email: email.trim().toLowerCase(),
      createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted an application for this role recently.',
      });
    }

    const application = await JobApplication.create({
      job: id,
      applicant: req.user?._id || null,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      college: (college || '').trim(),
      gradYear: (gradYear || '').trim(),
      resumeUrl: (resumeUrl || '').trim(),
      portfolioUrl: (portfolioUrl || '').trim(),
      coverNote: (coverNote || '').trim(),
      customAnswers: Array.isArray(customAnswers) ? customAnswers : [],
      status: 'PENDING',
    });

    // Increment application count on job
    await CareerJob.findByIdAndUpdate(id, { $inc: { applicationCount: 1 } });

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully! Our team will review your application soon.',
      applicationId: application._id,
    });
  } catch (error) {
    console.error('[Career API] Error submitting application:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to submit application' });
  }
};

// ==========================================
// ADMIN CONTROLLERS (Admin Panel)
// ==========================================

/**
 * GET /api/admin/careers
 * List all job openings with statistics & filters
 */
exports.adminGetJobs = async (req, res) => {
  try {
    const { status, department, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== 'ALL') query.status = status;
    if (department && department !== 'All') query.department = new RegExp(`^${department}$`, 'i');
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { department: regex }, { location: regex }];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [jobs, totalJobs, statsResult, allDepts] = await Promise.all([
      CareerJob.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('createdBy', 'username email avatar')
        .lean(),
      CareerJob.countDocuments(query),
      CareerJob.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ['$status', 'CLOSED'] }, 1, 0] } },
            drafts: { $sum: { $cond: [{ $eq: ['$status', 'DRAFT'] }, 1, 0] } },
            totalApplications: { $sum: '$applicationCount' },
          },
        },
      ]),
      CareerJob.distinct('department'),
    ]);

    const stats = statsResult[0] || {
      total: 0,
      active: 0,
      closed: 0,
      drafts: 0,
      totalApplications: 0,
    };

    // Get total real application count across the system
    const totalAppsInDb = await JobApplication.countDocuments();
    stats.totalApplications = totalAppsInDb;

    return res.status(200).json({
      success: true,
      jobs,
      stats,
      departments: allDepts.filter(Boolean),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalJobs,
        totalPages: Math.ceil(totalJobs / Number(limit)) || 1,
      },
    });
  } catch (error) {
    console.error('[Admin Career API] Error fetching jobs:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch job openings' });
  }
};

/**
 * POST /api/admin/careers
 * Create a new job opening with dynamic custom fields & highlights
 */
exports.adminCreateJob = async (req, res) => {
  try {
    const {
      title,
      department,
      location,
      type,
      experience,
      salary,
      description,
      responsibilities,
      requirements,
      perks,
      customFields,
      customHighlights,
      applyType,
      externalLink,
      contactEmail,
      status,
      featured,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Description is required' });
    }

    const job = await CareerJob.create({
      title: title.trim(),
      department: (department || 'Engineering').trim(),
      location: (location || 'Remote (India)').trim(),
      type: type || 'Internship',
      experience: (experience || 'Fresher / College Student').trim(),
      salary: (salary || 'Competitive Stipend').trim(),
      description: description.trim(),
      responsibilities: Array.isArray(responsibilities)
        ? responsibilities.filter((r) => r && r.trim())
        : [],
      requirements: Array.isArray(requirements)
        ? requirements.filter((r) => r && r.trim())
        : [],
      perks: Array.isArray(perks) ? perks.filter((p) => p && p.trim()) : [],
      customFields: Array.isArray(customFields) ? customFields : [],
      customHighlights: Array.isArray(customHighlights) ? customHighlights : [],
      applyType: applyType || 'INTERNAL_FORM',
      externalLink: (externalLink || '').trim(),
      contactEmail: (contactEmail || 'careers@hykee.in').trim(),
      status: status || 'OPEN',
      featured: Boolean(featured),
      createdBy: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: 'Job opening created successfully',
      job,
    });
  } catch (error) {
    console.error('[Admin Career API] Error creating job:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create job opening' });
  }
};

/**
 * PUT /api/admin/careers/:id
 * Update an existing job opening
 */
exports.adminUpdateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      department,
      location,
      type,
      experience,
      salary,
      description,
      responsibilities,
      requirements,
      perks,
      customFields,
      customHighlights,
      applyType,
      externalLink,
      contactEmail,
      status,
      featured,
    } = req.body;

    const job = await CareerJob.findById(id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job opening not found' });
    }

    if (title !== undefined) job.title = title.trim();
    if (department !== undefined) job.department = department.trim();
    if (location !== undefined) job.location = location.trim();
    if (type !== undefined) job.type = type;
    if (experience !== undefined) job.experience = experience.trim();
    if (salary !== undefined) job.salary = salary.trim();
    if (description !== undefined) job.description = description.trim();
    if (responsibilities !== undefined) {
      job.responsibilities = Array.isArray(responsibilities)
        ? responsibilities.filter((r) => r && r.trim())
        : [];
    }
    if (requirements !== undefined) {
      job.requirements = Array.isArray(requirements)
        ? requirements.filter((r) => r && r.trim())
        : [];
    }
    if (perks !== undefined) {
      job.perks = Array.isArray(perks) ? perks.filter((p) => p && p.trim()) : [];
    }
    if (customFields !== undefined) {
      job.customFields = Array.isArray(customFields) ? customFields : [];
    }
    if (customHighlights !== undefined) {
      job.customHighlights = Array.isArray(customHighlights) ? customHighlights : [];
    }
    if (applyType !== undefined) job.applyType = applyType;
    if (externalLink !== undefined) job.externalLink = externalLink.trim();
    if (contactEmail !== undefined) job.contactEmail = contactEmail.trim();
    if (status !== undefined) job.status = status;
    if (featured !== undefined) job.featured = Boolean(featured);

    await job.save();

    return res.status(200).json({
      success: true,
      message: 'Job opening updated successfully',
      job,
    });
  } catch (error) {
    console.error('[Admin Career API] Error updating job:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to update job opening' });
  }
};

/**
 * PATCH /api/admin/careers/:id/status
 * Toggle job status (OPEN, CLOSED, DRAFT)
 */
exports.adminToggleJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['OPEN', 'CLOSED', 'DRAFT'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const job = await CareerJob.findByIdAndUpdate(id, { status }, { new: true });
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job opening not found' });
    }

    return res.status(200).json({
      success: true,
      message: `Job status updated to ${status}`,
      job,
    });
  } catch (error) {
    console.error('[Admin Career API] Error toggling status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

/**
 * DELETE /api/admin/careers/:id
 * Delete job and associated applications
 */
exports.adminDeleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await CareerJob.findByIdAndDelete(id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job opening not found' });
    }

    // Delete all applications for this job
    await JobApplication.deleteMany({ job: id });

    return res.status(200).json({
      success: true,
      message: 'Job opening and associated applications deleted successfully',
    });
  } catch (error) {
    console.error('[Admin Career API] Error deleting job:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete job opening' });
  }
};

/**
 * GET /api/admin/careers/applications
 * List applications with search, job filter, and status filter
 */
exports.adminGetApplications = async (req, res) => {
  try {
    const { jobId, status, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (jobId && jobId !== 'ALL') query.job = jobId;
    if (status && status !== 'ALL') query.status = status;
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { fullName: regex },
        { email: regex },
        { phone: regex },
        { college: regex },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [applications, totalApps, statusCounts] = await Promise.all([
      JobApplication.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('job', 'title department type status location')
        .populate('applicant', 'username email avatar college verified')
        .populate('reviewedBy', 'username')
        .lean(),
      JobApplication.countDocuments(query),
      JobApplication.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = {
      PENDING: 0,
      REVIEWING: 0,
      SHORTLISTED: 0,
      REJECTED: 0,
      HIRED: 0,
    };
    statusCounts.forEach((item) => {
      if (stats[item._id] !== undefined) {
        stats[item._id] = item.count;
      }
    });

    return res.status(200).json({
      success: true,
      applications,
      stats,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalApps,
        totalPages: Math.ceil(totalApps / Number(limit)) || 1,
      },
    });
  } catch (error) {
    console.error('[Admin Career API] Error fetching applications:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
};

/**
 * PATCH /api/admin/careers/applications/:id/status
 * Update application status and admin notes
 */
exports.adminUpdateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const application = await JobApplication.findById(id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (status) {
      if (!['PENDING', 'REVIEWING', 'SHORTLISTED', 'REJECTED', 'HIRED'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid application status' });
      }
      application.status = status;
      application.reviewedAt = new Date();
      application.reviewedBy = req.user?._id || null;
    }

    if (adminNotes !== undefined) {
      application.adminNotes = adminNotes.trim();
    }

    await application.save();

    return res.status(200).json({
      success: true,
      message: `Application marked as ${application.status}`,
      application,
    });
  } catch (error) {
    console.error('[Admin Career API] Error updating application status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update application' });
  }
};

/**
 * DELETE /api/admin/careers/applications/:id
 * Delete a candidate application
 */
exports.adminDeleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await JobApplication.findByIdAndDelete(id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    // Decrement count on job
    if (application.job) {
      await CareerJob.findByIdAndUpdate(application.job, { $inc: { applicationCount: -1 } });
    }

    return res.status(200).json({
      success: true,
      message: 'Application deleted successfully',
    });
  } catch (error) {
    console.error('[Admin Career API] Error deleting application:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete application' });
  }
};
