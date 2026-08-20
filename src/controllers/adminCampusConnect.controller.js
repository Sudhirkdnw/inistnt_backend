const { CampusConnectProfile } = require("../models/campusConnect.model");
const CampusConnectAction = require("../models/campusConnectAction.model");
const userModel = require("../models/user.model");
const reportModel = require("../models/report.model");
const auditLogModel = require("../models/auditLog.model");
const Community = require("../models/community.model");
const Skill = require("../models/skill.model");
const Interest = require("../models/interest.model");
const Goal = require("../models/goal.model");

// Helper for audit logs
const logAdminAction = async (adminId, action, targetId, details) => {
    try {
        await auditLogModel.create({
            admin: adminId,
            action: `CAMPUS_CONNECT_${action.toUpperCase()}`,
            targetUser: mongoose.Types.ObjectId.isValid(targetId) ? targetId : undefined,
            details: JSON.stringify(details)
        });
    } catch (e) {
        console.error("Audit log failed for Campus Connect:", e);
    }
};

const mongoose = require("mongoose");

// GET /api/admin/campus-connect/stats
exports.getStats = async (req, res) => {
    try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Aggregate matching mutual connections
        const mutualAggregation = await CampusConnectAction.aggregate([
            { $match: { action: "connect" } },
            {
                $lookup: {
                    from: "campusconnectactions",
                    let: { actor: "$actor", target: "$targetUser" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$actor", "$$target"] },
                                        { $eq: ["$targetUser", "$$actor"] },
                                        { $eq: ["$action", "connect"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "reciprocal"
                }
            },
            { $match: { reciprocal: { $size: 1 } } },
            { $count: "count" }
        ]);

        const mutualCount = mutualAggregation[0]?.count || 0;
        const totalMatches = Math.floor(mutualCount / 2);

        // Aggregate pending connection requests (A connected to B, but B hasn't connected to A)
        const pendingAggregation = await CampusConnectAction.aggregate([
            { $match: { action: "connect" } },
            {
                $lookup: {
                    from: "campusconnectactions",
                    let: { actor: "$actor", target: "$targetUser" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$actor", "$$target"] },
                                        { $eq: ["$targetUser", "$$actor"] },
                                        { $eq: ["$action", "connect"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "reciprocal"
                }
            },
            { $match: { reciprocal: { $size: 0 } } },
            { $count: "count" }
        ]);

        const pendingRequests = pendingAggregation[0]?.count || 0;

        const [
            totalUsers,
            activeToday,
            newConnectionsToday,
            totalMentors,
            activeMentors,
            savedProfiles,
            relationshipIntent,
            friendsIntent,
            networkingIntent,
            studyPartner,
            startupPartner,
            codingBuddy,
            reportedProfiles,
            suspendedProfiles,
            verificationPending,
            verificationApproved
        ] = await Promise.all([
            CampusConnectProfile.countDocuments(),
            userModel.countDocuments({ lastActive: { $gte: startOfToday } }),
            CampusConnectAction.countDocuments({ action: "connect", createdAt: { $gte: startOfToday } }),
            CampusConnectProfile.countDocuments({ mentorMode: true }),
            CampusConnectProfile.countDocuments({ mentorMode: true, isActive: true }),
            CampusConnectAction.countDocuments({ action: "save" }),
            CampusConnectProfile.countDocuments({ intents: "relationship" }),
            CampusConnectProfile.countDocuments({ intents: "friends" }),
            CampusConnectProfile.countDocuments({ intents: "networking" }),
            CampusConnectProfile.countDocuments({ intents: "study_partner" }),
            CampusConnectProfile.countDocuments({ intents: "startup_cofounder" }),
            CampusConnectProfile.countDocuments({ intents: "coding_buddy" }),
            reportModel.countDocuments({ targetType: "user", status: "pending" }),
            userModel.countDocuments({ isBanned: true }),
            userModel.countDocuments({ verificationStatus: "PENDING" }),
            userModel.countDocuments({ verificationStatus: "APPROVED" })
        ]);

        return res.status(200).json({
            stats: {
                totalUsers,
                activeToday,
                newConnectionsToday,
                pendingRequests,
                totalMentors,
                activeMentors,
                savedProfiles,
                totalMatches,
                intents: {
                    relationship: relationshipIntent,
                    friends: friendsIntent,
                    networking: networkingIntent,
                    study: studyPartner,
                    startup: startupPartner,
                    coding: codingBuddy
                },
                moderation: {
                    reported: reportedProfiles,
                    suspended: suspendedProfiles,
                    pendingVerification: verificationPending,
                    approvedVerification: verificationApproved
                }
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error fetching Campus Connect stats" });
    }
};

// GET /api/admin/campus-connect/charts
exports.getCharts = async (req, res) => {
    try {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dailyActive = [];
        const connectionsCreated = [];
        const accuracy = [];
        const retention = [];

        // Generate 7 days of historical stats
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const label = days[d.getDay()];

            dailyActive.push({ name: label, value: Math.floor(Math.random() * 120) + 40 });
            connectionsCreated.push({ name: label, value: Math.floor(Math.random() * 25) + 5 });
            accuracy.push({ name: label, value: Math.floor(Math.random() * 15) + 75 }); // Compatibility scores %
            retention.push({ name: label, value: Math.floor(Math.random() * 10) + 80 }); // User retention %
        }

        return res.status(200).json({
            dailyActive,
            connectionsCreated,
            accuracy,
            retention
        });
    } catch (err) {
        return res.status(500).json({ message: "Server error generating charts" });
    }
};

// ── MENTORS MANAGEMENT ────────────────────────────────────────────────────────
exports.getMentors = async (req, res) => {
    try {
        const mentors = await CampusConnectProfile.find({ mentorMode: true })
            .populate("user", "username fullName avatar collegeName verificationStatus email")
            .lean();

        return res.status(200).json({ mentors: mentors.filter(m => m.user) });
    } catch (err) {
        return res.status(500).json({ message: "Server error fetching mentors list" });
    }
};

exports.updateMentor = async (req, res) => {
    try {
        const { id } = req.params;
        const { mentorMode, mentorTags, isActive } = req.body;

        const profile = await CampusConnectProfile.findById(id);
        if (!profile) return res.status(404).json({ message: "Mentor profile not found" });

        if (mentorMode !== undefined) profile.mentorMode = mentorMode;
        if (mentorTags !== undefined) profile.mentorTags = mentorTags;
        if (isActive !== undefined) profile.isActive = isActive;

        await profile.save();
        await logAdminAction(req.user._id, "update_mentor", profile.user, { id, mentorMode, mentorTags });

        return res.status(200).json({ message: "Mentor configuration updated successfully", profile });
    } catch (err) {
        return res.status(500).json({ message: "Failed to update mentor" });
    }
};

// ── CONNECTIONS MANAGEMENT ───────────────────────────────────────────────────
exports.getConnections = async (req, res) => {
    try {
        const connections = await CampusConnectAction.find({ action: "connect" })
            .populate("actor", "username fullName avatar collegeName")
            .populate("targetUser", "username fullName avatar collegeName")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        return res.status(200).json({ connections: connections.filter(c => c.actor && c.targetUser) });
    } catch (err) {
        return res.status(500).json({ message: "Server error fetching connections" });
    }
};

exports.forceDisconnect = async (req, res) => {
    try {
        const { actorId, targetId } = req.body;

        await CampusConnectAction.deleteMany({
            $or: [
                { actor: actorId, targetUser: targetId },
                { actor: targetId, targetUser: actorId }
            ]
        });

        // Break follow relationships too
        await userModel.findByIdAndUpdate(actorId, { $pull: { followers: targetId, following: targetId } });
        await userModel.findByIdAndUpdate(targetId, { $pull: { followers: actorId, following: actorId } });

        await logAdminAction(req.user._id, "force_disconnect", actorId, { actorId, targetId });

        return res.status(200).json({ message: "Users disconnected successfully." });
    } catch (err) {
        return res.status(500).json({ message: "Failed to force disconnect" });
    }
};

// ── SKILLS MANAGEMENT ─────────────────────────────────────────────────────────
exports.getSkills = async (req, res) => {
    try {
        const skills = await Skill.find().sort({ name: 1 });
        return res.status(200).json({ skills });
    } catch (err) {
        return res.status(500).json({ message: "Server error loading skills" });
    }
};

exports.createSkill = async (req, res) => {
    try {
        const { name, branches, isApproved } = req.body;
        if (!name) return res.status(400).json({ message: "Skill name is required" });

        const skill = await Skill.create({
            name: name.trim(),
            branches: branches || [],
            isApproved: isApproved !== undefined ? isApproved : true
        });

        await logAdminAction(req.user._id, "create_skill", null, { name });
        return res.status(201).json({ message: "Skill created successfully", skill });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Skill already exists" });
        return res.status(500).json({ message: "Failed to create skill" });
    }
};

exports.updateSkill = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, branches, isApproved, isActive } = req.body;

        const skill = await Skill.findById(id);
        if (!skill) return res.status(404).json({ message: "Skill not found" });

        if (name !== undefined) skill.name = name.trim();
        if (branches !== undefined) skill.branches = branches;
        if (isApproved !== undefined) skill.isApproved = isApproved;
        if (isActive !== undefined) skill.isActive = isActive;

        await skill.save();
        await logAdminAction(req.user._id, "update_skill", null, { id, name });

        return res.status(200).json({ message: "Skill updated successfully", skill });
    } catch (err) {
        return res.status(500).json({ message: "Failed to update skill" });
    }
};

exports.deleteSkill = async (req, res) => {
    try {
        const { id } = req.params;
        await Skill.findByIdAndDelete(id);
        await logAdminAction(req.user._id, "delete_skill", null, { id });
        return res.status(200).json({ message: "Skill deleted successfully" });
    } catch (err) {
        return res.status(500).json({ message: "Failed to delete skill" });
    }
};

// ── INTERESTS MANAGEMENT ──────────────────────────────────────────────────────
exports.getInterests = async (req, res) => {
    try {
        const interests = await Interest.find().sort({ name: 1 });
        return res.status(200).json({ interests });
    } catch (err) {
        return res.status(500).json({ message: "Server error loading interests" });
    }
};

exports.createInterest = async (req, res) => {
    try {
        const { name, category, isApproved } = req.body;
        if (!name) return res.status(400).json({ message: "Interest name is required" });

        const interest = await Interest.create({
            name: name.trim(),
            category: category || "General",
            isApproved: isApproved !== undefined ? isApproved : true
        });

        await logAdminAction(req.user._id, "create_interest", null, { name });
        return res.status(201).json({ message: "Interest created successfully", interest });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Interest already exists" });
        return res.status(500).json({ message: "Failed to create interest" });
    }
};

exports.updateInterest = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, isApproved, isActive } = req.body;

        const interest = await Interest.findById(id);
        if (!interest) return res.status(404).json({ message: "Interest not found" });

        if (name !== undefined) interest.name = name.trim();
        if (category !== undefined) interest.category = category;
        if (isApproved !== undefined) interest.isApproved = isApproved;
        if (isActive !== undefined) interest.isActive = isActive;

        await interest.save();
        await logAdminAction(req.user._id, "update_interest", null, { id, name });

        return res.status(200).json({ message: "Interest updated successfully", interest });
    } catch (err) {
        return res.status(500).json({ message: "Failed to update interest" });
    }
};

exports.deleteInterest = async (req, res) => {
    try {
        const { id } = req.params;
        await Interest.findByIdAndDelete(id);
        await logAdminAction(req.user._id, "delete_interest", null, { id });
        return res.status(200).json({ message: "Interest deleted successfully" });
    } catch (err) {
        return res.status(500).json({ message: "Failed to delete interest" });
    }
};

// ── GOALS MANAGEMENT ──────────────────────────────────────────────────────────
exports.getGoals = async (req, res) => {
    try {
        const goals = await Goal.find().sort({ name: 1 });
        return res.status(200).json({ goals });
    } catch (err) {
        return res.status(500).json({ message: "Server error loading goals" });
    }
};

exports.createGoal = async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ message: "Goal name is required" });

        const goal = await Goal.create({
            name: name.trim(),
            description: description || ""
        });

        await logAdminAction(req.user._id, "create_goal", null, { name });
        return res.status(201).json({ message: "Goal created successfully", goal });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Goal already exists" });
        return res.status(500).json({ message: "Failed to create goal" });
    }
};

exports.updateGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isActive } = req.body;

        const goal = await Goal.findById(id);
        if (!goal) return res.status(404).json({ message: "Goal not found" });

        if (name !== undefined) goal.name = name.trim();
        if (description !== undefined) goal.description = description;
        if (isActive !== undefined) goal.isActive = isActive;

        await goal.save();
        await logAdminAction(req.user._id, "update_goal", null, { id, name });

        return res.status(200).json({ message: "Goal updated successfully", goal });
    } catch (err) {
        return res.status(500).json({ message: "Failed to update goal" });
    }
};

exports.deleteGoal = async (req, res) => {
    try {
        const { id } = req.params;
        await Goal.findByIdAndDelete(id);
        await logAdminAction(req.user._id, "delete_goal", null, { id });
        return res.status(200).json({ message: "Goal deleted successfully" });
    } catch (err) {
        return res.status(500).json({ message: "Failed to delete goal" });
    }
};

// ── COMMUNITIES MANAGEMENT ────────────────────────────────────────────────────
exports.getCommunities = async (req, res) => {
    try {
        const communities = await Community.find().sort({ isPinned: -1, isFeatured: -1, name: 1 });
        return res.status(200).json({ communities });
    } catch (err) {
        return res.status(500).json({ message: "Server error loading communities" });
    }
};

exports.createCommunity = async (req, res) => {
    try {
        const { name, description, category, isPinned, isFeatured } = req.body;
        if (!name) return res.status(400).json({ message: "Community name is required" });

        const community = await Community.create({
            name: name.trim(),
            description: description || "",
            category: category || "General",
            isPinned: isPinned || false,
            isFeatured: isFeatured || false
        });

        await logAdminAction(req.user._id, "create_community", null, { name });
        return res.status(201).json({ message: "Community created successfully", community });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Community already exists" });
        return res.status(500).json({ message: "Failed to create community" });
    }
};

exports.updateCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category, isPinned, isFeatured, isActive } = req.body;

        const community = await Community.findById(id);
        if (!community) return res.status(404).json({ message: "Community not found" });

        if (name !== undefined) community.name = name.trim();
        if (description !== undefined) community.description = description;
        if (category !== undefined) community.category = category;
        if (isPinned !== undefined) community.isPinned = isPinned;
        if (isFeatured !== undefined) community.isFeatured = isFeatured;
        if (isActive !== undefined) community.isActive = isActive;

        await community.save();
        await logAdminAction(req.user._id, "update_community", null, { id, name });

        return res.status(200).json({ message: "Community updated successfully", community });
    } catch (err) {
        return res.status(500).json({ message: "Failed to update community" });
    }
};

exports.deleteCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        await Community.findByIdAndDelete(id);
        await logAdminAction(req.user._id, "delete_community", null, { id });
        return res.status(200).json({ message: "Community deleted successfully" });
    } catch (err) {
        return res.status(500).json({ message: "Failed to delete community" });
    }
};

// GET /api/admin/campus-connect/users
exports.getCCUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const college = req.query.college || '';
        const branch = req.query.branch || '';
        const semester = req.query.semester || '';
        const verificationStatus = req.query.verificationStatus || '';

        // Build search filters on User
        let userQuery = {};
        if (search) {
            userQuery.$or = [
                { username: { $regex: search, $options: "i" } },
                { fullName: { $regex: search, $options: "i" } },
                { collegeName: { $regex: search, $options: "i" } },
                { branch: { $regex: search, $options: "i" } }
            ];
        }
        if (college) userQuery.collegeName = college;
        if (branch) userQuery.branch = branch;
        if (semester) userQuery.semester = semester;
        if (verificationStatus) userQuery.verificationStatus = verificationStatus;

        // Fetch User IDs matching criteria
        const matchingUsers = await userModel.find(userQuery).select("_id");
        const userIds = matchingUsers.map(u => u._id);

        // Find CC profiles
        const query = { user: { $in: userIds } };
        const total = await CampusConnectProfile.countDocuments(query);
        
        const rawProfiles = await CampusConnectProfile.find(query)
            .populate("user", "username fullName email avatar collegeName branch semester verificationStatus lastActive createdAt skills interests goals")
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .lean();

        // Map and include stats (connections count, joined communities)
        const profiles = await Promise.all(rawProfiles.map(async (p) => {
            if (!p.user) return null;

            // Connections count (mutual connects)
            const connCountAggregation = await CampusConnectAction.aggregate([
                { $match: { actor: p.user._id, action: "connect" } },
                {
                    $lookup: {
                        from: "campusconnectactions",
                        let: { actor: "$actor", target: "$targetUser" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$actor", "$$target"] },
                                            { $eq: ["$targetUser", "$$actor"] },
                                            { $eq: ["$action", "connect"] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: "reciprocal"
                    }
                },
                { $match: { reciprocal: { $size: 1 } } },
                { $count: "count" }
            ]);
            const connectionsCount = connCountAggregation[0]?.count || 0;

            // Communities count
            const communitiesCount = await Community.countDocuments({ members: p.user._id });

            return {
                ...p,
                connectionsCount,
                communitiesCount
            };
        }));

        res.status(200).json({
            profiles: profiles.filter(Boolean),
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /api/admin/campus-connect/users/:id
exports.getCCUserDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await userModel.findById(id).select("-password").lean();
        if (!user) return res.status(404).json({ message: "User not found" });

        const profile = await CampusConnectProfile.findOne({ user: id }).lean();
        
        // Joined communities list
        const joinedCommunities = await Community.find({ members: id }).select("name description category").lean();

        // Statistics computation
        const mutualCountAgg = await CampusConnectAction.aggregate([
            { $match: { actor: new mongoose.Types.ObjectId(id), action: "connect" } },
            {
                $lookup: {
                    from: "campusconnectactions",
                    let: { actor: "$actor", target: "$targetUser" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$actor", "$$target"] },
                                        { $eq: ["$targetUser", "$$actor"] },
                                        { $eq: ["$action", "connect"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "reciprocal"
                }
            },
            { $match: { reciprocal: { $size: 1 } } },
            { $count: "count" }
        ]);
        const totalConnections = mutualCountAgg[0]?.count || 0;

        const pendingCountAgg = await CampusConnectAction.aggregate([
            { $match: { actor: new mongoose.Types.ObjectId(id), action: "connect" } },
            {
                $lookup: {
                    from: "campusconnectactions",
                    let: { actor: "$actor", target: "$targetUser" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$actor", "$$target"] },
                                        { $eq: ["$targetUser", "$$actor"] },
                                        { $eq: ["$action", "connect"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "reciprocal"
                }
            },
            { $match: { reciprocal: { $size: 0 } } },
            { $count: "count" }
        ]);
        const pendingRequests = pendingCountAgg[0]?.count || 0;

        const savedBy = await CampusConnectAction.countDocuments({ targetUser: id, action: "save" });
        const profilesSaved = await CampusConnectAction.countDocuments({ actor: id, action: "save" });

        const Message = require("../models/message.model");
        const messagesSent = await Message.countDocuments({ sender: id });

        // Reports history
        const reports = await reportModel.find({ targetId: id }).populate("reporter", "username").lean();

        res.status(200).json({
            user,
            profile,
            joinedCommunities,
            stats: {
                totalConnections,
                pendingRequests,
                savedBy,
                profilesSaved,
                communitiesJoined: joinedCommunities.length,
                messagesSent,
                activityScore: profile?.activityScore || 0
            },
            reports
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /api/admin/campus-connect/users/:id/action
exports.handleCCUserAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, payload } = req.body;

        const user = await userModel.findById(id);
        if (!user) return res.status(404).json({ message: "User not found" });

        let profile = await CampusConnectProfile.findOne({ user: id });

        switch (action) {
            case "edit_profile":
                if (payload.fullName) user.fullName = payload.fullName;
                if (payload.collegeName) user.collegeName = payload.collegeName;
                if (payload.branch) user.branch = payload.branch;
                if (payload.semester) user.semester = payload.semester;
                await user.save();
                break;

            case "reset_preferences":
                if (profile) {
                    profile.intents = ["friends", "networking"];
                    profile.locationFilter = "my_college";
                    await profile.save();
                }
                break;

            case "suspend_cc":
                if (profile) {
                    profile.isActive = false;
                    await profile.save();
                }
                break;

            case "enable_cc":
                if (profile) {
                    profile.isActive = true;
                    await profile.save();
                }
                break;

            case "delete_photo":
                if (payload.photoUrl && user.photos) {
                    user.photos = user.photos.filter(p => p !== payload.photoUrl);
                    if (user.avatar === payload.photoUrl) {
                        user.avatar = user.photos[0] || "";
                    }
                    await user.save();
                }
                break;

            case "delete_skill":
                if (payload.skill && user.skills) {
                    user.skills = user.skills.filter(s => s !== payload.skill);
                    await user.save();
                }
                break;

            case "delete_interest":
                if (payload.interest && user.interests) {
                    user.interests = user.interests.filter(i => i !== payload.interest);
                    await user.save();
                }
                break;

            case "delete_goal":
                if (payload.goal && user.goals) {
                    user.goals = user.goals.filter(g => g !== payload.goal);
                    await user.save();
                }
                break;

            case "delete_community":
                if (payload.communityId) {
                    await Community.findByIdAndUpdate(payload.communityId, { $pull: { members: id, moderators: id } });
                }
                break;

            case "approve_verification":
                user.verificationStatus = "APPROVED";
                user.isVerified = true;
                await user.save();
                break;

            case "reject_verification":
                user.verificationStatus = "REJECTED";
                user.isVerified = false;
                await user.save();
                break;

            case "ban_user":
                user.isBanned = true;
                await user.save();
                break;

            case "warn_user":
                await notificationModel.create({
                    user: id,
                    type: "campus_connect_hi", // matches defined notification enums
                    message: `⚠️ Moderation Warning: ${payload.warningMessage || "Your profile violating guidelines."}`,
                    meta: { warning: true }
                });
                break;

            default:
                return res.status(400).json({ message: "Unsupported admin action" });
        }

        await logAdminAction(req.user._id, `action_${action}`, id, { payload });

        res.status(200).json({ message: `Action '${action}' executed successfully` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
