const mongoose = require('mongoose');
const Team = require('../models/team.model');
const TeamMember = require('../models/teamMember.model');
const TeamApplication = require('../models/teamApplication.model');
const Conversation = require('../models/conversation.model');
const Confession = require('../models/confession.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');

// Helper to get socket instance
const getIO = (req) => req.app.get('io');

/**
 * Check applicant eligibility against team rules
 */
const checkUserEligibility = (team, user, membership, application) => {
  if (!user) {
    return { canApply: false, reason: 'Authentication required' };
  }

  const isOwner = String(team.owner?._id || team.owner) === String(user._id);
  if (isOwner) {
    return { canApply: false, reason: 'You are the creator of this team', isOwner: true };
  }

  if (membership && membership.status === 'ACTIVE') {
    return { canApply: false, reason: 'You are already a member of this team', isMember: true };
  }

  if (application) {
    if (application.status === 'PENDING') {
      return { canApply: false, reason: 'Application pending', hasApplied: true, applicationStatus: 'PENDING' };
    }
    if (application.status === 'ACCEPTED') {
      return { canApply: false, reason: 'Application accepted', isMember: true, applicationStatus: 'ACCEPTED' };
    }
    if (application.status === 'REJECTED') {
      return { canApply: false, reason: 'Application not selected', hasApplied: true, applicationStatus: 'REJECTED' };
    }
  }

  if (team.status === 'FULL' || team.currentMemberCount >= team.maxMembers) {
    return { canApply: false, reason: 'Team is full' };
  }

  if (team.status === 'CLOSED' || team.status === 'ARCHIVED') {
    return { canApply: false, reason: 'Recruitment is closed' };
  }

  // Gender preference check
  if (team.genderPreference && team.genderPreference !== 'ANY') {
    const userGender = (user.gender || '').toUpperCase();
    if (userGender && userGender !== team.genderPreference) {
      return {
        canApply: false,
        reason: `Only ${team.genderPreference === 'FEMALE' ? 'female' : 'male'} applicants are eligible`,
        genderRestricted: true
      };
    }
  }

  // College restriction check
  if (team.collegeScope === 'SAME_COLLEGE' && team.collegeName) {
    const userCollege = (user.collegeName || '').trim().toLowerCase();
    const teamCollege = team.collegeName.trim().toLowerCase();
    if (userCollege && userCollege !== teamCollege) {
      return {
        canApply: false,
        reason: `Only students from ${team.collegeName} can apply`,
        collegeRestricted: true
      };
    }
  }

  return { canApply: true, reason: null };
};

/**
 * ── GET /api/teams ───────────────────────────────────────────────────────────
 * Discover active team recruitment posts with filters, search, and eligibility
 */
exports.getTeams = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const {
      search,
      category,
      collegeScope,
      genderPreference,
      status = 'ACTIVE',
      collegeOnly,
      skills
    } = req.query;

    const query = {};

    // Status filter
    if (status && status !== 'ALL') {
      query.status = status;
    } else {
      query.status = { $in: ['ACTIVE', 'FULL'] };
    }

    // Category filter
    if (category && category !== 'All') {
      query.category = category;
    }

    // College scope
    if (collegeScope) {
      query.collegeScope = collegeScope;
    }

    // Gender preference
    if (genderPreference && genderPreference !== 'ALL') {
      query.genderPreference = { $in: [genderPreference, 'ANY'] };
    }

    // College Only filter for campus mode
    if (collegeOnly === 'true' && req.user?.collegeName) {
      query.collegeName = req.user.collegeName;
    }

    // Search query
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { purpose: searchRegex },
        { skills: searchRegex },
        { category: searchRegex },
        { collegeName: searchRegex }
      ];
    }

    // Skills array filter
    if (skills) {
      const skillList = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim());
      if (skillList.length > 0) {
        query.skills = { $in: skillList };
      }
    }

    const [teams, total] = await Promise.all([
      Team.find(query)
        .populate('owner', 'fullName username avatar collegeName branch year gender isVerified')
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Team.countDocuments(query)
    ]);

    // Compute user eligibility for each team if user is logged in
    let memberships = [];
    let applications = [];

    if (req.user?._id && teams.length > 0) {
      const teamIds = teams.map(t => t._id);
      [memberships, applications] = await Promise.all([
        TeamMember.find({ team: { $in: teamIds }, user: req.user._id, status: 'ACTIVE' }).lean(),
        TeamApplication.find({ team: { $in: teamIds }, applicant: req.user._id }).lean()
      ]);
    }

    const memberMap = new Map(memberships.map(m => [String(m.team), m]));
    const appMap = new Map(applications.map(a => [String(a.team), a]));

    const enrichedTeams = teams.map(team => {
      const mem = memberMap.get(String(team._id));
      const app = appMap.get(String(team._id));
      const eligibility = checkUserEligibility(team, req.user, mem, app);

      return {
        ...team,
        isOwner: String(team.owner?._id) === String(req.user?._id),
        isMember: !!mem || String(team.owner?._id) === String(req.user?._id),
        hasApplied: !!app,
        applicationStatus: app?.status || null,
        canApply: eligibility.canApply,
        ineligibleReason: eligibility.reason,
        genderRestricted: !!eligibility.genderRestricted,
        collegeRestricted: !!eligibility.collegeRestricted
      };
    });

    return res.json({
      success: true,
      teams: enrichedTeams,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('getTeams error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch teams' });
  }
};

/**
 * ── GET /api/teams/:id ───────────────────────────────────────────────────────
 * Get single team details, owner profile, member roster, and user application state
 */
exports.getTeamDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findById(id)
      .populate('owner', 'fullName username avatar collegeName branch year gender bio isVerified')
      .populate('conversation', '_id name')
      .lean();

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Fetch members and applications
    const [members, myMembership, myApplication] = await Promise.all([
      TeamMember.find({ team: id, status: 'ACTIVE' })
        .populate('user', 'fullName username avatar collegeName branch year bio isVerified')
        .sort({ role: 1, createdAt: 1 })
        .lean(),
      req.user ? TeamMember.findOne({ team: id, user: req.user._id, status: 'ACTIVE' }).lean() : null,
      req.user ? TeamApplication.findOne({ team: id, applicant: req.user._id }).lean() : null
    ]);

    const eligibility = checkUserEligibility(team, req.user, myMembership, myApplication);

    return res.json({
      success: true,
      team: {
        ...team,
        members,
        isOwner: String(team.owner?._id) === String(req.user?._id),
        isMember: !!myMembership || String(team.owner?._id) === String(req.user?._id),
        hasApplied: !!myApplication,
        applicationStatus: myApplication?.status || null,
        myApplication: myApplication || null,
        canApply: eligibility.canApply,
        ineligibleReason: eligibility.reason,
        genderRestricted: !!eligibility.genderRestricted,
        collegeRestricted: !!eligibility.collegeRestricted
      }
    });
  } catch (err) {
    console.error('getTeamDetails error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch team details' });
  }
};

/**
 * ── POST /api/teams ──────────────────────────────────────────────────────────
 * Create a new team requirement & publish to Team Finder & Home Feed
 */
exports.createTeam = async (req, res) => {
  try {
    const {
      title,
      purpose,
      category = 'Project',
      skills = [],
      maxMembers = 4,
      genderPreference = 'ANY',
      collegeScope = 'ALL_COLLEGES'
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Team title is required.' });
    }

    if (!purpose || !purpose.trim()) {
      return res.status(400).json({ success: false, message: 'Team purpose/description is required.' });
    }

    const parsedMaxMembers = Math.max(2, Math.min(50, parseInt(maxMembers, 10) || 4));

    // Clean skills list
    const skillList = Array.isArray(skills)
      ? skills.map(s => String(s).trim()).filter(Boolean)
      : typeof skills === 'string'
      ? skills.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const collegeName = req.user.collegeName || '';
    const collegeId = req.user.collegeId || null;

    // 1. Create Team record
    const team = await Team.create({
      title: title.trim(),
      purpose: purpose.trim(),
      category,
      skills: skillList,
      owner: req.user._id,
      currentMemberCount: 1,
      maxMembers: parsedMaxMembers,
      genderPreference: ['MALE', 'FEMALE', 'ANY'].includes(genderPreference?.toUpperCase())
        ? genderPreference.toUpperCase()
        : 'ANY',
      collegeScope: collegeScope === 'SAME_COLLEGE' ? 'SAME_COLLEGE' : 'ALL_COLLEGES',
      collegeName,
      collegeId,
      status: 'ACTIVE'
    });

    // 2. Add owner to TeamMember roster
    await TeamMember.create({
      team: team._id,
      user: req.user._id,
      role: 'OWNER',
      status: 'ACTIVE'
    });

    // 3. Create dedicated Team Group Conversation
    const conversation = await Conversation.create({
      type: 'team',
      teamId: team._id,
      name: `${team.title} (Team)`,
      admin: req.user._id,
      participants: [req.user._id]
    });

    // 4. Create linked Home Feed Post (Confession with postType: "TEAM_RECRUITMENT")
    const feedText = `🚀 Looking for teammates: ${team.title}\n\n${team.purpose}\n\nSkills: ${skillList.join(', ')}`;
    const feedPost = await Confession.create({
      confessionText: feedText,
      category: 'other',
      user: req.user._id,
      isAnonymous: false,
      postType: 'TEAM_RECRUITMENT',
      team: team._id,
      collegeName: team.collegeName
    });

    // 5. Update team with references
    team.conversation = conversation._id;
    team.confessionPost = feedPost._id;
    await team.save();

    // 6. Broadcast new team creation via Socket.IO
    const io = getIO(req);
    if (io) {
      io.emit('team_status_updated', {
        teamId: team._id,
        status: 'ACTIVE',
        currentMemberCount: 1
      });
    }

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'fullName username avatar collegeName branch year isVerified')
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Team recruitment post created successfully!',
      team: {
        ...populatedTeam,
        isOwner: true,
        isMember: true,
        canApply: false
      }
    });
  } catch (err) {
    console.error('createTeam error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create team' });
  }
};

/**
 * ── POST /api/teams/:id/apply ────────────────────────────────────────────────
 * Apply to join an active team recruitment
 */
exports.applyToTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { message = '', skills = [] } = req.body;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Check existing membership & application
    const [membership, existingApp] = await Promise.all([
      TeamMember.findOne({ team: id, user: req.user._id, status: 'ACTIVE' }),
      TeamApplication.findOne({ team: id, applicant: req.user._id })
    ]);

    const eligibility = checkUserEligibility(team, req.user, membership, existingApp);
    if (!eligibility.canApply) {
      return res.status(400).json({
        success: false,
        message: eligibility.reason || 'You are not eligible to apply for this team.'
      });
    }

    const skillList = Array.isArray(skills)
      ? skills.map(s => String(s).trim()).filter(Boolean)
      : typeof skills === 'string'
      ? skills.split(',').map(s => s.trim()).filter(Boolean)
      : req.user.skills || [];

    // Create or update application
    let application;
    if (existingApp) {
      existingApp.message = message.trim();
      existingApp.skills = skillList;
      existingApp.status = 'PENDING';
      existingApp.reviewedAt = null;
      existingApp.reviewedBy = null;
      await existingApp.save();
      application = existingApp;
    } else {
      application = await TeamApplication.create({
        team: team._id,
        applicant: req.user._id,
        message: message.trim(),
        skills: skillList,
        status: 'PENDING'
      });
    }

    // Send notification to Team Owner
    await Notification.create({
      recipient: team.owner,
      sender: req.user._id,
      type: 'team_application',
      team: team._id,
      message: `${req.user.fullName || req.user.username} applied to join "${team.title}".`,
      previewText: message.trim().slice(0, 80)
    });

    // Real-time socket notification to owner
    const io = getIO(req);
    if (io) {
      io.to(String(team.owner)).emit('team_application_created', {
        teamId: team._id,
        applicationId: application._id,
        applicant: {
          _id: req.user._id,
          fullName: req.user.fullName,
          username: req.user.username,
          avatar: req.user.avatar,
          collegeName: req.user.collegeName,
          branch: req.user.branch,
          year: req.user.year
        },
        message: message.trim()
      });
    }

    return res.json({
      success: true,
      message: 'Application submitted successfully!',
      application
    });
  } catch (err) {
    console.error('applyToTeam error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to submit application' });
  }
};

/**
 * ── GET /api/teams/user/my-teams ─────────────────────────────────────────────
 * Get user's Created teams, Joined teams, and Submitted applications
 */
exports.getMyTeams = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Created teams (user is owner)
    const createdTeams = await Team.find({ owner: userId, status: { $ne: 'ARCHIVED' } })
      .sort({ createdAt: -1 })
      .lean();

    const createdTeamIds = createdTeams.map(t => t._id);

    // Count pending applications for each created team
    const pendingCounts = await TeamApplication.aggregate([
      { $match: { team: { $in: createdTeamIds }, status: 'PENDING' } },
      { $group: { _id: '$team', count: { $sum: 1 } } }
    ]);

    const countMap = new Map(pendingCounts.map(p => [String(p._id), p.count]));
    const enrichedCreated = createdTeams.map(t => ({
      ...t,
      pendingApplicationsCount: countMap.get(String(t._id)) || 0,
      isOwner: true,
      isMember: true
    }));

    // 2. Joined teams (where user is active member and NOT owner)
    const myMemberships = await TeamMember.find({
      user: userId,
      role: { $ne: 'OWNER' },
      status: 'ACTIVE'
    }).populate({
      path: 'team',
      populate: { path: 'owner', select: 'fullName username avatar collegeName' }
    }).lean();

    const joinedTeams = myMemberships
      .filter(m => m.team && m.team.status !== 'ARCHIVED')
      .map(m => ({
        ...m.team,
        memberRole: m.role,
        joinedAt: m.joinedAt,
        isOwner: false,
        isMember: true
      }));

    // 3. Applied teams (applications submitted by user)
    const appliedList = await TeamApplication.find({ applicant: userId })
      .populate({
        path: 'team',
        populate: { path: 'owner', select: 'fullName username avatar collegeName' }
      })
      .sort({ createdAt: -1 })
      .lean();

    const appliedTeams = appliedList.filter(a => a.team).map(a => ({
      applicationId: a._id,
      status: a.status,
      appliedAt: a.createdAt,
      message: a.message,
      team: a.team
    }));

    return res.json({
      success: true,
      created: enrichedCreated,
      joined: joinedTeams,
      applied: appliedTeams
    });
  } catch (err) {
    console.error('getMyTeams error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch your teams' });
  }
};

/**
 * ── GET /api/teams/:id/applications ──────────────────────────────────────────
 * Team owner views all applications for their team
 */
exports.getTeamApplications = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    if (String(team.owner) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the team owner can view applications.' });
    }

    const applications = await TeamApplication.find({ team: id })
      .populate('applicant', 'fullName username avatar collegeName branch year gender bio skills isVerified')
      .sort({ status: 1, createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      team: {
        _id: team._id,
        title: team.title,
        currentMemberCount: team.currentMemberCount,
        maxMembers: team.maxMembers,
        status: team.status
      },
      applications
    });
  } catch (err) {
    console.error('getTeamApplications error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch applications' });
  }
};

/**
 * ── PUT /api/teams/:id/applications/:applicationId ───────────────────────────
 * Team owner accepts or rejects an application
 */
exports.respondToApplication = async (req, res) => {
  try {
    const { id, applicationId } = req.params;
    const { action } = req.body; // 'ACCEPT' | 'REJECT'

    if (!['ACCEPT', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action. Must be ACCEPT or REJECT.' });
    }

    const [team, application] = await Promise.all([
      Team.findById(id),
      TeamApplication.findById(applicationId).populate('applicant', 'fullName username avatar')
    ]);

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (String(team.owner) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the team owner can respond to applications.' });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Application is already ${application.status.toLowerCase()}.` });
    }

    const io = getIO(req);

    if (action === 'ACCEPT') {
      // Check capacity
      if (team.currentMemberCount >= team.maxMembers) {
        return res.status(400).json({ success: false, message: 'Team is already full.' });
      }

      // 1. Update application status
      application.status = 'ACCEPTED';
      application.reviewedAt = new Date();
      application.reviewedBy = req.user._id;
      await application.save();

      // 2. Add applicant to TeamMember roster
      await TeamMember.findOneAndUpdate(
        { team: team._id, user: application.applicant._id },
        { role: 'MEMBER', status: 'ACTIVE', joinedAt: new Date() },
        { upsert: true, new: true }
      );

      // 3. Increment team member count
      const updatedCount = await TeamMember.countDocuments({ team: team._id, status: 'ACTIVE' });
      team.currentMemberCount = updatedCount;
      if (updatedCount >= team.maxMembers) {
        team.status = 'FULL';
      }
      await team.save();

      // 4. Add applicant to team group conversation
      if (team.conversation) {
        await Conversation.findByIdAndUpdate(team.conversation, {
          $addToSet: { participants: application.applicant._id }
        });
      }

      // 5. Send notification to accepted applicant
      await Notification.create({
        recipient: application.applicant._id,
        sender: req.user._id,
        type: 'team_application_accepted',
        team: team._id,
        message: `🎉 Congratulations! You have been accepted into "${team.title}".`
      });

      // 6. Socket updates
      if (io) {
        io.to(String(application.applicant._id)).emit('team_application_updated', {
          teamId: team._id,
          status: 'ACCEPTED',
          message: `Accepted into ${team.title}`
        });

        io.emit('team_status_updated', {
          teamId: team._id,
          currentMemberCount: team.currentMemberCount,
          status: team.status
        });
      }

      return res.json({
        success: true,
        message: `${application.applicant.fullName || application.applicant.username} has been accepted into the team!`,
        team: {
          currentMemberCount: team.currentMemberCount,
          maxMembers: team.maxMembers,
          status: team.status
        }
      });
    } else {
      // REJECT action
      application.status = 'REJECTED';
      application.reviewedAt = new Date();
      application.reviewedBy = req.user._id;
      await application.save();

      // Send rejection notification
      await Notification.create({
        recipient: application.applicant._id,
        sender: req.user._id,
        type: 'team_application_rejected',
        team: team._id,
        message: `Your application for "${team.title}" was not selected.`
      });

      if (io) {
        io.to(String(application.applicant._id)).emit('team_application_updated', {
          teamId: team._id,
          status: 'REJECTED',
          message: `Application not selected for ${team.title}`
        });
      }

      return res.json({
        success: true,
        message: 'Application rejected.',
        applicationId: application._id
      });
    }
  } catch (err) {
    console.error('respondToApplication error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to process application' });
  }
};

/**
 * ── PUT /api/teams/:id/status ────────────────────────────────────────────────
 * Team owner updates team status (ACTIVE, CLOSED, ARCHIVED)
 */
exports.updateTeamStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'CLOSED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    if (String(team.owner) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only team owner can change status.' });
    }

    team.status = status;
    await team.save();

    const io = getIO(req);
    if (io) {
      io.emit('team_status_updated', {
        teamId: team._id,
        status: team.status
      });
    }

    return res.json({
      success: true,
      message: `Team status updated to ${status}.`,
      team
    });
  } catch (err) {
    console.error('updateTeamStatus error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update team status' });
  }
};
