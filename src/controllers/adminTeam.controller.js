const Team = require('../models/team.model');
const TeamMember = require('../models/teamMember.model');
const TeamApplication = require('../models/teamApplication.model');
const Conversation = require('../models/conversation.model');
const Confession = require('../models/confession.model');

/**
 * ── GET /api/admin/teams ─────────────────────────────────────────────────────
 * Admin team listing with filters & overview stats
 */
exports.getAdminTeams = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const skip = (page - 1) * limit;

    const { search, category, status, collegeName } = req.query;
    const query = {};

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (category && category !== 'All') {
      query.category = category;
    }

    if (collegeName) {
      query.collegeName = new RegExp(collegeName.trim(), 'i');
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: regex },
        { purpose: regex },
        { skills: regex },
        { collegeName: regex }
      ];
    }

    const [teams, total, totalActive, totalFull, totalClosed] = await Promise.all([
      Team.find(query)
        .populate('owner', 'fullName username avatar email collegeName isVerified')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Team.countDocuments(query),
      Team.countDocuments({ status: 'ACTIVE' }),
      Team.countDocuments({ status: 'FULL' }),
      Team.countDocuments({ status: { $in: ['CLOSED', 'ARCHIVED'] } })
    ]);

    return res.json({
      success: true,
      teams,
      stats: {
        total,
        totalActive,
        totalFull,
        totalClosed
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('getAdminTeams error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch admin teams' });
  }
};

/**
 * ── GET /api/admin/teams/:id ─────────────────────────────────────────────────
 * Admin view team details with full member roster and applications
 */
exports.getAdminTeamDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const [team, members, applications] = await Promise.all([
      Team.findById(id).populate('owner', 'fullName username avatar email collegeName branch year').lean(),
      TeamMember.find({ team: id }).populate('user', 'fullName username avatar email collegeName branch year').lean(),
      TeamApplication.find({ team: id }).populate('applicant', 'fullName username avatar email collegeName branch year').lean()
    ]);

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    return res.json({
      success: true,
      team,
      members,
      applications
    });
  } catch (err) {
    console.error('getAdminTeamDetails error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch admin team details' });
  }
};

/**
 * ── PUT /api/admin/teams/:id/status ──────────────────────────────────────────
 * Admin force-update team status
 */
exports.updateAdminTeamStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'FULL', 'CLOSED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const team = await Team.findByIdAndUpdate(id, { status }, { returnDocument: 'after' });
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    return res.json({
      success: true,
      message: `Team status updated to ${status}`,
      team
    });
  } catch (err) {
    console.error('updateAdminTeamStatus error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update team status' });
  }
};

/**
 * ── DELETE /api/admin/teams/:id ──────────────────────────────────────────────
 * Permanent Admin Cascade Deletion of Team
 */
exports.deleteAdminTeam = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findById(id);
    if (!team) {
      // Even if not found, perform cleanup of any lingering applications/members
      await TeamApplication.deleteMany({ team: id });
      await TeamMember.deleteMany({ team: id });
      return res.status(404).json({ success: false, message: 'Team not found or already deleted' });
    }

    // 1. Delete all team applications
    await TeamApplication.deleteMany({ team: id });

    // 2. Delete all team members
    await TeamMember.deleteMany({ team: id });

    // 3. Delete linked group conversation and messages
    if (team.conversation) {
      try {
        const Message = require('../models/message.model');
        await Message.deleteMany({ conversation: team.conversation });
        await Conversation.findByIdAndDelete(team.conversation);
      } catch (convErr) {
        console.warn('Error deleting team conversation:', convErr);
      }
    }

    // 4. Delete linked feed post (Confession with postType: TEAM_RECRUITMENT)
    if (team.confessionPost) {
      try {
        await Confession.findByIdAndDelete(team.confessionPost);
      } catch (postErr) {
        // Non-blocking
      }
    }

    // 5. Delete the Team document itself
    await Team.findByIdAndDelete(id);

    // 6. Broadcast deletion via Socket.IO
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('team_deleted', { teamId: id });
      }
    } catch (socketErr) {
      // Non-blocking
    }

    return res.json({
      success: true,
      message: `Team "${team.title}" and all related data permanently deleted by Admin.`,
      teamId: id
    });
  } catch (err) {
    console.error('deleteAdminTeam error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete team' });
  }
};
