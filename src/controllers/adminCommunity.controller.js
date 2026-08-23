const mongoose = require("mongoose");
const Community = require("../models/community.model");
const CommunityMember = require("../models/communityMember.model");
const Conversation = require("../models/conversation.model");
const { uploadImage } = require("../utils/cloudinary");

// Helper to generate URL-safe slug
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

// ── GET /api/admin/communities — Admin communities list with stats ─────────────
exports.getAdminCommunities = async (req, res) => {
    try {
        const { search, category, status, page = 1, limit = 15 } = req.query;

        const query = {};
        if (status && status !== "ALL") {
            query.status = status;
        }
        if (category && category !== "ALL" && category.trim()) {
            query.category = category.trim();
        }
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), "i");
            query.$or = [
                { name: regex },
                { slug: regex },
                { shortDescription: regex },
                { category: regex }
            ];
        }

        const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        const take = Math.min(50, Math.max(1, parseInt(limit)));

        const [communities, total] = await Promise.all([
            Community.find(query)
                .populate("createdBy", "username fullName email avatar")
                .sort({ isPinned: -1, isFeatured: -1, createdAt: -1 })
                .skip(skip)
                .limit(take)
                .lean(),
            Community.countDocuments(query)
        ]);

        // Get total stats
        const [totalActive, totalArchived, totalMembersAll] = await Promise.all([
            Community.countDocuments({ status: "ACTIVE" }),
            Community.countDocuments({ status: "ARCHIVED" }),
            CommunityMember.countDocuments({ status: "active" })
        ]);

        res.status(200).json({
            success: true,
            communities,
            stats: {
                total,
                totalActive,
                totalArchived,
                totalMembers: totalMembersAll
            },
            pagination: {
                total,
                page: parseInt(page),
                limit: take,
                totalPages: Math.ceil(total / take)
            }
        });
    } catch (error) {
        console.error("Error in getAdminCommunities:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── POST /api/admin/communities — Create a new community ──────────────────────
exports.createCommunity = async (req, res) => {
    try {
        const adminId = req.user._id;
        const {
            name,
            slug: customSlug,
            shortDescription,
            description,
            category = "Technology",
            rules = "",
            isPinned = false,
            isFeatured = false,
            status = "ACTIVE"
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Community name is required." });
        }

        let baseSlug = customSlug ? generateSlug(customSlug) : generateSlug(name);
        if (!baseSlug) baseSlug = "community-" + Date.now();

        // Check for slug uniqueness
        let uniqueSlug = baseSlug;
        let counter = 1;
        while (await Community.findOne({ slug: uniqueSlug })) {
            uniqueSlug = `${baseSlug}-${counter}`;
            counter++;
        }

        // Handle uploaded images (icon and coverPhoto)
        let iconUrl = req.body.icon || "";
        let coverUrl = req.body.coverPhoto || "";

        if (req.files) {
            if (req.files.icon && req.files.icon[0]) {
                const mime = req.files.icon[0].mimetype || "";
                iconUrl = await uploadImage(req.files.icon[0].buffer, {}, mime);
            }
            if (req.files.coverPhoto && req.files.coverPhoto[0]) {
                const mime = req.files.coverPhoto[0].mimetype || "";
                coverUrl = await uploadImage(req.files.coverPhoto[0].buffer, {}, mime);
            }
        }

        // Create Community document
        const community = new Community({
            name: name.trim(),
            slug: uniqueSlug,
            shortDescription: shortDescription ? shortDescription.trim() : "",
            description: description ? description.trim() : "",
            category: category.trim(),
            rules: rules ? rules.trim() : "",
            icon: iconUrl,
            coverPhoto: coverUrl,
            isPinned: Boolean(isPinned),
            isFeatured: Boolean(isFeatured),
            status: status || "ACTIVE",
            memberCount: 1, // Admin is first member
            createdBy: adminId
        });

        await community.save();

        // Create dedicated Group Conversation
        const conversation = await Conversation.create({
            type: "community",
            name: community.name,
            communityId: community._id,
            admin: adminId,
            participants: [adminId]
        });

        community.conversation = conversation._id;
        await community.save();

        // Add creating Admin as owner member
        await CommunityMember.create({
            community: community._id,
            user: adminId,
            role: "owner",
            status: "active"
        });

        res.status(201).json({
            success: true,
            message: `Community "${community.name}" created successfully!`,
            community
        });
    } catch (error) {
        console.error("Error in createCommunity:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── PUT /api/admin/communities/:id — Update existing community ────────────────
exports.updateCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            slug: customSlug,
            shortDescription,
            description,
            category,
            rules,
            isPinned,
            isFeatured,
            status
        } = req.body;

        const community = await Community.findById(id);
        if (!community) {
            return res.status(404).json({ success: false, message: "Community not found." });
        }

        if (name && name.trim()) community.name = name.trim();
        if (shortDescription !== undefined) community.shortDescription = shortDescription.trim();
        if (description !== undefined) community.description = description.trim();
        if (category !== undefined) community.category = category.trim();
        if (rules !== undefined) community.rules = rules.trim();
        if (isPinned !== undefined) community.isPinned = Boolean(isPinned);
        if (isFeatured !== undefined) community.isFeatured = Boolean(isFeatured);
        if (status && ["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) {
            community.status = status;
        }

        if (customSlug && customSlug.trim() && customSlug !== community.slug) {
            const cleanSlug = generateSlug(customSlug);
            const exists = await Community.findOne({ slug: cleanSlug, _id: { $ne: id } });
            if (exists) {
                return res.status(409).json({ success: false, message: "This slug is already in use by another community." });
            }
            community.slug = cleanSlug;
        }

        // Handle uploaded images if any
        if (req.body.icon !== undefined) community.icon = req.body.icon;
        if (req.body.coverPhoto !== undefined) community.coverPhoto = req.body.coverPhoto;

        if (req.files) {
            if (req.files.icon && req.files.icon[0]) {
                const mime = req.files.icon[0].mimetype || "";
                community.icon = await uploadImage(req.files.icon[0].buffer, {}, mime);
            }
            if (req.files.coverPhoto && req.files.coverPhoto[0]) {
                const mime = req.files.coverPhoto[0].mimetype || "";
                community.coverPhoto = await uploadImage(req.files.coverPhoto[0].buffer, {}, mime);
            }
        }

        await community.save();

        // Sync Conversation name if name changed
        if (community.conversation) {
            await Conversation.findByIdAndUpdate(community.conversation, { name: community.name });
        }

        res.status(200).json({
            success: true,
            message: "Community updated successfully!",
            community
        });
    } catch (error) {
        console.error("Error in updateCommunity:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── DELETE /api/admin/communities/:id — Archive or delete community ───────────
exports.deleteCommunity = async (req, res) => {
    try {
        const { id } = req.params;
        const { hardDelete } = req.query;

        if (hardDelete === "true") {
            const community = await Community.findByIdAndDelete(id);
            if (!community) return res.status(404).json({ success: false, message: "Community not found." });

            await CommunityMember.deleteMany({ community: id });
            if (community.conversation) {
                await Conversation.findByIdAndDelete(community.conversation);
            }
            return res.status(200).json({ success: true, message: "Community permanently deleted." });
        }

        // Default: Archive
        const community = await Community.findByIdAndUpdate(id, { status: "ARCHIVED" }, { new: true });
        if (!community) return res.status(404).json({ success: false, message: "Community not found." });

        res.status(200).json({
            success: true,
            message: `Community "${community.name}" has been archived.`,
            community
        });
    } catch (error) {
        console.error("Error in deleteCommunity:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── GET /api/admin/communities/:id/members — List members for admin ───────────
exports.getAdminCommunityMembers = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20, search, role, status } = req.query;

        const query = { community: id };
        if (role && role !== "ALL") query.role = role;
        if (status && status !== "ALL") query.status = status;

        const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        const take = Math.min(50, Math.max(1, parseInt(limit)));

        let members = await CommunityMember.find(query)
            .populate("user", "username fullName email avatar collegeName branch semester gradYear isVerified")
            .sort({ joinedAt: -1 })
            .skip(skip)
            .limit(take)
            .lean();

        if (search && search.trim()) {
            const s = search.trim().toLowerCase();
            members = members.filter(m => 
                m.user?.username?.toLowerCase().includes(s) ||
                m.user?.fullName?.toLowerCase().includes(s) ||
                m.user?.email?.toLowerCase().includes(s)
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
        console.error("Error in getAdminCommunityMembers:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── PUT /api/admin/communities/:id/members/:userId/role — Update member role ──
exports.updateMemberRole = async (req, res) => {
    try {
        const { id, userId } = req.params;
        const { role } = req.body; // 'owner', 'moderator', 'member'

        if (!["owner", "moderator", "member"].includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role specified." });
        }

        const member = await CommunityMember.findOneAndUpdate(
            { community: id, user: userId },
            { role },
            { new: true }
        ).populate("user", "username fullName email avatar");

        if (!member) {
            return res.status(404).json({ success: false, message: "Community member not found." });
        }

        // If moderator, also sync with community moderators array
        if (role === "moderator") {
            await Community.findByIdAndUpdate(id, { $addToSet: { moderators: userId } });
        } else {
            await Community.findByIdAndUpdate(id, { $pull: { moderators: userId } });
        }

        res.status(200).json({
            success: true,
            message: `User @${member.user?.username} role changed to ${role}.`,
            member
        });
    } catch (error) {
        console.error("Error in updateMemberRole:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ── DELETE /api/admin/communities/:id/members/:userId — Remove or Ban member ──
exports.removeOrBanMember = async (req, res) => {
    try {
        const { id, userId } = req.params;
        const { action = "remove" } = req.body; // 'remove' | 'ban'

        const community = await Community.findById(id);
        if (!community) return res.status(404).json({ success: false, message: "Community not found." });

        if (action === "ban") {
            await CommunityMember.findOneAndUpdate(
                { community: id, user: userId },
                { status: "banned", role: "member" },
                { upsert: true }
            );
        } else {
            await CommunityMember.findOneAndDelete({ community: id, user: userId });
        }

        // Pull from conversation participants
        if (community.conversation) {
            await Conversation.findByIdAndUpdate(community.conversation, {
                $pull: { participants: userId }
            });
        }

        // Recalculate member count
        const actualCount = await CommunityMember.countDocuments({ community: id, status: "active" });
        community.memberCount = actualCount;
        await community.save();

        res.status(200).json({
            success: true,
            message: action === "ban" ? "User has been banned from the community." : "User removed from community.",
            memberCount: actualCount
        });
    } catch (error) {
        console.error("Error in removeOrBanMember:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
