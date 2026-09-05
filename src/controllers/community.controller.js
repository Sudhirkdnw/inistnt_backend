const mongoose = require("mongoose");
const Community = require("../models/community.model");
const CommunityMember = require("../models/communityMember.model");
const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const { uploadImage } = require("../utils/cloudinary");
const { isUserActiveInConversation } = require("../utils/presence");

// ── Helper to generate URL-safe slug ──────────────────────────────────────────
function generateSlug(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

// ── GET /api/communities/home — Fast lightweight list for home/explore slider ──
exports.getHomeCommunities = async (req, res) => {
    try {
        const userId = req.user ? req.user._id : null;
        const userCollege = (req.user && req.user.collegeName) ? req.user.collegeName.trim() : (req.query.collegeName ? req.query.collegeName.trim() : "");

        const query = { status: "ACTIVE" };

        if (userCollege) {
            const escaped = userCollege.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { collegeName: userCollege },
                { collegeName: new RegExp(`^${escaped}$`, 'i') },
                { collegeName: new RegExp(`${escaped}`, 'i') }
            ];
        } else {
            // If user has not set a college, only show global or fallback
            query.$or = [{ isGlobal: true }, { collegeName: { $exists: false } }, { collegeName: "" }];
        }

        const communities = await Community.find(query)
            .select("name slug shortDescription category icon coverPhoto memberCount isPinned isFeatured collegeName isGlobal conversation")
            .sort({ isPinned: -1, isFeatured: -1, memberCount: -1, createdAt: -1 })
            .limit(12)
            .lean();

        let joinedSet = new Set();
        if (userId && communities.length > 0) {
            const communityIds = communities.map(c => c._id);
            const userMemberships = await CommunityMember.find({
                user: userId,
                community: { $in: communityIds },
                status: "active"
            }).select("community").lean();

            joinedSet = new Set(userMemberships.map(m => m.community.toString()));
        }

        const result = communities.map(c => ({
            ...c,
            isJoined: joinedSet.has(c._id.toString()),
            isMember: joinedSet.has(c._id.toString())
        }));

        res.status(200).json({ success: true, communities: result });
    } catch (error) {
        console.error("Error in getHomeCommunities:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── GET /api/communities — Discovery list with search, category & pagination ───
exports.getCommunities = async (req, res) => {
    try {
        const userId = req.user ? req.user._id : null;
        const userCollege = (req.user && req.user.collegeName) ? req.user.collegeName.trim() : (req.query.collegeName ? req.query.collegeName.trim() : "");
        const { search, category, page = 1, limit = 15 } = req.query;

        const conditions = [{ status: "ACTIVE" }];

        if (userCollege) {
            const escaped = userCollege.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            conditions.push({
                $or: [
                    { collegeName: userCollege },
                    { collegeName: new RegExp(`^${escaped}$`, 'i') },
                    { isGlobal: true }
                ]
            });
        }

        if (category && category !== "All" && category.trim()) {
            conditions.push({ category: category.trim() });
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
            conditions.push({
                $or: [
                    { name: regex },
                    { shortDescription: regex },
                    { description: regex },
                    { category: regex }
                ]
            });
        }

        const query = conditions.length === 1 ? conditions[0] : { $and: conditions };

        const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        const take = Math.min(50, Math.max(1, parseInt(limit)));

        const [communities, total] = await Promise.all([
            Community.find(query)
                .select("name slug shortDescription category icon coverPhoto memberCount isPinned isFeatured collegeName isGlobal conversation createdAt")
                .sort({ isPinned: -1, isFeatured: -1, memberCount: -1, createdAt: -1 })
                .skip(skip)
                .limit(take)
                .lean(),
            Community.countDocuments(query)
        ]);

        let joinedSet = new Set();
        if (userId && communities.length > 0) {
            const communityIds = communities.map(c => c._id);
            const userMemberships = await CommunityMember.find({
                user: userId,
                community: { $in: communityIds },
                status: "active"
            }).select("community").lean();

            joinedSet = new Set(userMemberships.map(m => m.community.toString()));
        }

        const list = communities.map(c => ({
            ...c,
            isJoined: joinedSet.has(c._id.toString())
        }));

        res.status(200).json({
            success: true,
            communities: list,
            pagination: {
                total,
                page: parseInt(page),
                limit: take,
                totalPages: Math.ceil(total / take)
            }
        });
    } catch (error) {
        console.error("Error in getCommunities:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── POST /api/communities — User creates a new community for their college ─────
exports.createCommunity = async (req, res) => {
    try {
        const userId = req.user._id;
        const userCollege = req.user.collegeName || req.body.collegeName || "";
        const collegeId = req.user.collegeId || null;

        const {
            name,
            shortDescription = "",
            description = "",
            category = "Technology",
            rules = ""
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Community name is required." });
        }

        const cleanName = name.trim();
        const slugBase = generateSlug(cleanName);
        const collegeSuffix = userCollege ? ('-' + generateSlug(userCollege).slice(0, 15)) : '';
        let slug = `${slugBase}${collegeSuffix}`;

        const existing = await Community.findOne({ slug });
        if (existing) {
            slug = `${slug}-${Date.now().toString(36)}`;
        }

        let iconUrl = req.body.icon || "";
        let coverPhotoUrl = req.body.coverPhoto || "";

        if (req.files?.icon?.[0]) {
            const uploaded = await uploadImage(req.files.icon[0].buffer, "communities/icons");
            iconUrl = uploaded.secure_url || uploaded.url;
        }
        if (req.files?.coverPhoto?.[0]) {
            const uploaded = await uploadImage(req.files.coverPhoto[0].buffer, "communities/covers");
            coverPhotoUrl = uploaded.secure_url || uploaded.url;
        }

        const community = await Community.create({
            name: cleanName,
            slug,
            shortDescription: shortDescription.trim(),
            description: description.trim(),
            category: category.trim(),
            collegeName: userCollege,
            collegeId,
            icon: iconUrl,
            coverPhoto: coverPhotoUrl,
            rules: rules.trim(),
            status: "ACTIVE",
            memberCount: 1,
            createdBy: userId,
            moderators: [userId]
        });

        // Create linked group conversation
        const conv = await Conversation.create({
            type: "community",
            name: community.name,
            communityId: community._id,
            participants: [userId]
        });

        community.conversation = conv._id;
        await community.save();

        // Add creator as owner in CommunityMember
        await CommunityMember.create({
            community: community._id,
            user: userId,
            role: "owner",
            status: "active",
            joinedAt: new Date()
        });

        res.status(201).json({
            success: true,
            message: `Community "${community.name}" created successfully for ${userCollege || 'your campus'}!`,
            community
        });
    } catch (error) {
        console.error("Error in createCommunity:", error);
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "A community with this name or slug already exists." });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── GET /api/communities/:idOrSlug — Detailed community info ──────────────────
exports.getCommunityDetails = async (req, res) => {
    try {
        const { idOrSlug } = req.params;
        const userId = req.user ? req.user._id : null;

        const isObjectId = mongoose.Types.ObjectId.isValid(idOrSlug);
        const filter = isObjectId ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] } : { slug: idOrSlug };

        const community = await Community.findOne(filter)
            .populate("createdBy", "username fullName avatar")
            .populate("moderators", "username fullName avatar")
            .lean();

        if (!community) {
            return res.status(404).json({ success: false, message: "Community not found" });
        }

        let isJoined = false;
        let userRole = null;
        let memberStatus = null;

        if (userId) {
            const membership = await CommunityMember.findOne({
                community: community._id,
                user: userId
            }).lean();

            if (membership) {
                isJoined = membership.status === "active";
                userRole = membership.role;
                memberStatus = membership.status;
            }
        }

        // Ensure linked conversation exists
        let conversationId = community.conversation;
        if (!conversationId) {
            let conv = await Conversation.findOne({ communityId: community._id });
            if (!conv) {
                conv = await Conversation.create({
                    type: "community",
                    name: community.name,
                    communityId: community._id,
                    participants: community.createdBy ? [community.createdBy] : []
                });
            }
            conversationId = conv._id;
            await Community.findByIdAndUpdate(community._id, { conversation: conversationId });
        }

        // Get real member count from database
        const actualMemberCount = await CommunityMember.countDocuments({
            community: community._id,
            status: "active"
        });
        if (community.memberCount !== actualMemberCount) {
            Community.findByIdAndUpdate(community._id, { memberCount: actualMemberCount }).exec().catch(() => {});
        }

        res.status(200).json({
            success: true,
            community: {
                ...community,
                memberCount: actualMemberCount,
                conversation: conversationId,
                isJoined,
                userRole,
                memberStatus
            }
        });
    } catch (error) {
        console.error("Error in getCommunityDetails:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── POST /api/communities/:id/join — Join a community ─────────────────────────
exports.joinCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const community = await Community.findById(id);
        if (!community) {
            return res.status(404).json({ success: false, message: "Community not found" });
        }

        if (community.status !== "ACTIVE") {
            return res.status(403).json({ success: false, message: "This community is not currently active" });
        }

        // Check existing membership
        let membership = await CommunityMember.findOne({ community: id, user: userId });

        if (membership) {
            if (membership.status === "banned") {
                return res.status(403).json({ success: false, message: "You have been banned from this community." });
            }
            if (membership.status === "active") {
                return res.status(200).json({
                    success: true,
                    message: "You are already a member of this community",
                    isJoined: true,
                    memberCount: community.memberCount,
                    conversationId: community.conversation
                });
            }
            // Reactivate membership if left previously
            membership.status = "active";
            membership.joinedAt = new Date();
            await membership.save();
        } else {
            await CommunityMember.create({
                community: id,
                user: userId,
                role: "member",
                status: "active"
            });
        }

        // Increment member count and sync conversation participants
        const actualCount = await CommunityMember.countDocuments({ community: id, status: "active" });
        community.memberCount = actualCount;

        // Ensure Conversation exists & add user to participants
        let conversationId = community.conversation;
        if (!conversationId) {
            let conv = await Conversation.findOne({ communityId: id });
            if (!conv) {
                conv = await Conversation.create({
                    type: "community",
                    name: community.name,
                    communityId: id,
                    participants: [userId]
                });
            }
            conversationId = conv._id;
            community.conversation = conversationId;
        } else {
            await Conversation.findByIdAndUpdate(conversationId, {
                $addToSet: { participants: userId }
            });
        }

        await community.save();

        res.status(200).json({
            success: true,
            message: `Welcome to ${community.name}!`,
            isJoined: true,
            memberCount: actualCount,
            conversationId
        });
    } catch (error) {
        console.error("Error in joinCommunity:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── POST /api/communities/:id/leave — Leave a community ───────────────────────
exports.leaveCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const community = await Community.findById(id);
        if (!community) {
            return res.status(404).json({ success: false, message: "Community not found" });
        }

        // Delete or mark inactive
        await CommunityMember.findOneAndDelete({ community: id, user: userId });

        // Update member count
        const actualCount = await CommunityMember.countDocuments({ community: id, status: "active" });
        community.memberCount = actualCount;
        await community.save();

        // Remove from conversation participants
        if (community.conversation) {
            await Conversation.findByIdAndUpdate(community.conversation, {
                $pull: { participants: userId }
            });
        }

        res.status(200).json({
            success: true,
            message: `You have left ${community.name}`,
            isJoined: false,
            memberCount: actualCount
        });
    } catch (error) {
        console.error("Error in leaveCommunity:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── GET /api/communities/:id/members — List members with pagination ───────────
exports.getCommunityMembers = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20, search } = req.query;

        const query = { community: id, status: "active" };

        const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        const take = Math.min(50, Math.max(1, parseInt(limit)));

        let members = await CommunityMember.find(query)
            .populate("user", "username fullName avatar collegeName branch semester gradYear isVerified")
            .sort({ role: 1, joinedAt: -1 })
            .skip(skip)
            .limit(take)
            .lean();

        if (search && search.trim()) {
            const s = search.trim().toLowerCase();
            members = members.filter(m => 
                m.user?.username?.toLowerCase().includes(s) ||
                m.user?.fullName?.toLowerCase().includes(s) ||
                m.user?.collegeName?.toLowerCase().includes(s)
            );
        }

        const total = await CommunityMember.countDocuments(query);

        res.status(200).json({
            success: true,
            members,
            pagination: {
                total,
                page: parseInt(page),
                limit: take,
                totalPages: Math.ceil(total / take)
            }
        });
    } catch (error) {
        console.error("Error in getCommunityMembers:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── GET /api/communities/:id/messages — Get community group chat history ──────
exports.getCommunityMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { before, limit = 30 } = req.query;

        const community = await Community.findById(id);
        if (!community) {
            return res.status(404).json({ success: false, message: "Community not found" });
        }

        // Verify active membership
        const membership = await CommunityMember.findOne({
            community: id,
            user: userId,
            status: "active"
        });

        if (!membership && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "You must join this community to view group conversations."
            });
        }

        let conversationId = community.conversation;
        if (!conversationId) {
            let conv = await Conversation.findOne({ communityId: id });
            if (!conv) {
                conv = await Conversation.create({
                    type: "community",
                    name: community.name,
                    communityId: id,
                    participants: [userId]
                });
            }
            conversationId = conv._id;
            await Community.findByIdAndUpdate(id, { conversation: conversationId });
        }

        const messageQuery = { conversation: conversationId };
        if (before) {
            messageQuery._id = { $lt: before };
        }

        const take = Math.min(50, Math.max(1, parseInt(limit)));
        const messages = await Message.find(messageQuery)
            .populate("sender", "username fullName avatar isVerified collegeName")
            .populate({
                path: "replyTo",
                select: "text mediaUrl mediaType sender",
                populate: { path: "sender", select: "username fullName avatar" }
            })
            .sort({ _id: -1 })
            .limit(take)
            .lean();

        // Reverse to chronological order for client display
        messages.reverse();

        // Mark unread messages in this community conversation as read by current user
        Message.updateMany(
            { conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId } },
            { $addToSet: { readBy: userId } }
        ).exec().catch(() => {});

        res.status(200).json({
            success: true,
            conversationId,
            messages,
            hasMore: messages.length === take
        });
    } catch (error) {
        console.error("Error in getCommunityMessages:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── DELETE /api/communities/:id — Delete community (owner only) ───────────────
exports.deleteCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const community = await Community.findById(id);
        if (!community) {
            return res.status(404).json({ success: false, message: "Community not found." });
        }

        // Authorization: only the owner (or platform admin) can delete
        const membership = await CommunityMember.findOne({
            community: id,
            user: userId,
            role: "owner",
            status: "active"
        });

        if (!membership && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Only the community owner can delete this community."
            });
        }

        // Cascade delete all related data
        // 1. Delete all messages in the linked conversation
        if (community.conversation) {
            await Message.deleteMany({ conversation: community.conversation });
            // 2. Delete the conversation itself
            await Conversation.findByIdAndDelete(community.conversation);
        }

        // 3. Delete all community members
        await CommunityMember.deleteMany({ community: id });

        // 4. Delete the community document
        await Community.findByIdAndDelete(id);

        // Broadcast deletion via Socket.IO so all open screens update
        const io = req.app.get("io");
        if (io) {
            io.emit("community_deleted", { communityId: id });
        }

        res.status(200).json({
            success: true,
            message: `Community "${community.name}" has been permanently deleted.`,
            communityId: id
        });
    } catch (error) {
        console.error("Error in deleteCommunity:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── POST /api/communities/:id/messages — Send message in community group chat ──
exports.sendCommunityMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { text, replyTo, tempId } = req.body;

        const community = await Community.findById(id);
        if (!community) {
            return res.status(404).json({ success: false, message: "Community not found" });
        }

        if (community.status !== "ACTIVE" && req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "This community is currently archived or inactive." });
        }

        // Verify active membership
        const membership = await CommunityMember.findOne({
            community: id,
            user: userId,
            status: "active"
        });

        if (!membership && req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "You must join this community to send messages."
            });
        }

        let mediaUrl = undefined;
        let mediaType = undefined;

        if (req.file) {
            const mimetype = req.file.mimetype || "";
            mediaUrl = await uploadImage(req.file.buffer, {}, mimetype);
            if (mimetype.startsWith("image/")) mediaType = "image";
            else if (mimetype.startsWith("video/")) mediaType = "video";
            else if (mimetype.startsWith("audio/")) mediaType = "audio";
        }

        if ((!text || !text.trim()) && !mediaUrl) {
            return res.status(400).json({ success: false, message: "Message text or media is required." });
        }

        // Ensure conversation exists
        let conversationId = community.conversation;
        if (!conversationId) {
            const conv = await Conversation.create({
                type: "community",
                name: community.name,
                communityId: id,
                participants: [userId]
            });
            conversationId = conv._id;
            await Community.findByIdAndUpdate(id, { conversation: conversationId });
        }

        const message = await Message.create({
            conversation: conversationId,
            sender: userId,
            text: text ? text.trim() : "",
            mediaUrl,
            mediaType,
            replyTo: replyTo || undefined,
            readBy: [userId]
        });

        // Non-blocking Conversation lastMessage update
        Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: message._id,
            updatedAt: new Date()
        }).catch(err => console.error("Error updating community conversation:", err));

        // In-memory sender construction (0ms database query overhead)
        const senderPayload = {
            _id: userId,
            username: req.user.username,
            fullName: req.user.fullName || req.user.username,
            avatar: req.user.avatar || "",
            isVerified: req.user.isVerified || false,
            collegeName: req.user.collegeName || ""
        };

        let populatedReplyTo = undefined;
        if (replyTo) {
            populatedReplyTo = await Message.findById(replyTo)
                .select("text mediaUrl mediaType sender")
                .populate("sender", "username fullName avatar")
                .lean()
                .catch(() => undefined);
        }

        const msgPayload = {
            ...message.toObject(),
            sender: senderPayload,
            replyTo: populatedReplyTo || message.replyTo || undefined,
            _tempId: tempId || null,
            communityId: id,
            conversationId: conversationId.toString()
        };

        // Broadcast to Socket.IO rooms immediately (< 2ms)
        const io = req.app.get("io");
        if (io) {
            io.to(conversationId.toString()).emit("receive-message", msgPayload);
            io.to(id.toString()).emit("receive-community-message", msgPayload);
        }

        res.status(201).json({
            success: true,
            message: msgPayload,
            _tempId: tempId || null
        });
    } catch (error) {
        console.error("Error in sendCommunityMessage:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
