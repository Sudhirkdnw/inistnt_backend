const CampusAmbassador = require("../models/campusAmbassador.model");
const Referral = require("../models/referral.model");
const userModel = require("../models/user.model");
const { generateUniqueReferralCode, sanitizeString } = require("../utils/referralCodeGenerator");

/**
 * Helper to compute live referral metrics for an array of ambassadors
 */
async function computeAmbassadorStats(ambassadorIds) {
    const now = new Date();
    
    // Fetch all referrals for these ambassadors
    const referrals = await Referral.find({ ambassador: { $in: ambassadorIds } })
        .populate("referredUser", "isVerified verificationStatus isPremium premiumExpireAt")
        .lean();

    const statsMap = {};
    for (const ambId of ambassadorIds) {
        statsMap[String(ambId)] = {
            totalReferrals: 0,
            verifiedReferrals: 0,
            premiumReferrals: 0,
            activePremiumReferrals: 0,
            conversionRate: 0
        };
    }

    for (const ref of referrals) {
        const key = String(ref.ambassador);
        if (!statsMap[key]) continue;

        statsMap[key].totalReferrals++;
        const u = ref.referredUser;
        if (u) {
            if (u.isVerified || u.verificationStatus === "VERIFIED") {
                statsMap[key].verifiedReferrals++;
            }
            if (u.isPremium) {
                statsMap[key].premiumReferrals++;
                if (u.premiumExpireAt && new Date(u.premiumExpireAt) > now) {
                    statsMap[key].activePremiumReferrals++;
                }
            }
        }
    }

    // Calculate rates
    for (const key of Object.keys(statsMap)) {
        const item = statsMap[key];
        item.conversionRate = item.totalReferrals > 0
            ? Math.round((item.verifiedReferrals / item.totalReferrals) * 100)
            : 0;
    }

    return statsMap;
}

/**
 * GET /api/admin/ambassadors
 * List all Campus Ambassadors with filters, search, and live metrics
 */
async function listAmbassadors(req, res) {
    try {
        const { search, college, status, page = 1, limit = 20, sortBy = "createdAt", order = "desc" } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const skip = (pageNum - 1) * limitNum;

        const query = {};
        if (status && status !== "all") {
            query.status = status.toUpperCase();
        }
        if (college && college !== "all") {
            query.college = new RegExp(college.trim(), "i");
        }

        let userFilterIds = null;
        if (search && search.trim()) {
            const s = search.trim();
            const matchingUsers = await userModel.find({
                $or: [
                    { username: new RegExp(s, "i") },
                    { fullName: new RegExp(s, "i") },
                    { email: new RegExp(s, "i") }
                ]
            }).select("_id").lean();

            userFilterIds = matchingUsers.map(u => u._id);
            query.$or = [
                { referralCode: new RegExp(s, "i") },
                { college: new RegExp(s, "i") },
                { user: { $in: userFilterIds } }
            ];
        }

        const [ambassadors, totalCount] = await Promise.all([
            CampusAmbassador.find(query)
                .sort({ [sortBy]: order === "asc" ? 1 : -1 })
                .skip(skip)
                .limit(limitNum)
                .populate("user", "fullName username email avatar collegeName verificationStatus isVerified isPremium")
                .populate("assignedBy", "username fullName")
                .lean(),
            CampusAmbassador.countDocuments(query)
        ]);

        const ambassadorIds = ambassadors.map(a => a._id);
        const statsMap = await computeAmbassadorStats(ambassadorIds);

        const enrichedList = ambassadors.map(a => ({
            ...a,
            metrics: statsMap[String(a._id)] || {
                totalReferrals: 0,
                verifiedReferrals: 0,
                premiumReferrals: 0,
                activePremiumReferrals: 0,
                conversionRate: 0
            }
        }));

        return res.status(200).json({
            ambassadors: enrichedList,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(totalCount / limitNum) || 1,
                totalCount,
                hasMore: pageNum * limitNum < totalCount
            }
        });
    } catch (error) {
        console.error("listAmbassadors error:", error);
        return res.status(500).json({ message: "Server error listing ambassadors" });
    }
}

/**
 * GET /api/admin/ambassadors/:id
 * Detailed view of an individual ambassador with full paginated referral table
 */
async function getAmbassadorDetails(req, res) {
    try {
        const { id } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const ambassador = await CampusAmbassador.findById(id)
            .populate("user", "fullName username email avatar collegeName verificationStatus isVerified isPremium premiumExpireAt createdAt phone")
            .populate("assignedBy", "username fullName email")
            .lean();

        if (!ambassador) {
            return res.status(404).json({ message: "Campus Ambassador not found" });
        }

        const statsMap = await computeAmbassadorStats([ambassador._id]);
        const metrics = statsMap[String(ambassador._id)];

        const [referrals, totalReferralsCount] = await Promise.all([
            Referral.find({ ambassador: ambassador._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("referredUser", "fullName username email avatar collegeName verificationStatus isVerified isPremium premiumExpireAt createdAt")
                .lean(),
            Referral.countDocuments({ ambassador: ambassador._id })
        ]);

        const now = new Date();
        const referredStudents = referrals
            .filter(r => r.referredUser != null)
            .map(r => {
                const u = r.referredUser;
                const isPremiumActive = u.isPremium && u.premiumExpireAt && new Date(u.premiumExpireAt) > now;
                return {
                    _id: u._id,
                    fullName: u.fullName || u.username,
                    username: u.username,
                    email: u.email,
                    avatar: u.avatar || "",
                    collegeName: u.collegeName || "Campus Student",
                    verificationStatus: u.verificationStatus || (u.isVerified ? "VERIFIED" : "NONE"),
                    isVerified: u.isVerified || u.verificationStatus === "VERIFIED",
                    isPremium: u.isPremium || false,
                    isPremiumActive: Boolean(isPremiumActive),
                    premiumExpireAt: u.premiumExpireAt,
                    joinedDate: r.createdAt || u.createdAt
                };
            });

        return res.status(200).json({
            ambassador: {
                ...ambassador,
                metrics
            },
            referrals: referredStudents,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalReferralsCount / limit) || 1,
                totalCount: totalReferralsCount,
                hasMore: page * limit < totalReferralsCount
            }
        });
    } catch (error) {
        console.error("getAmbassadorDetails error:", error);
        return res.status(500).json({ message: "Server error fetching ambassador details" });
    }
}

/**
 * POST /api/admin/ambassadors
 * Assign Campus Ambassador role to an existing user with unique code
 */
async function assignAmbassador(req, res) {
    try {
        const { userId, customCode, notes } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User account not found" });
        }

        const existingAmbassador = await CampusAmbassador.findOne({ user: userId });
        if (existingAmbassador) {
            if (existingAmbassador.status === "REVOKED" || existingAmbassador.status === "INACTIVE") {
                existingAmbassador.status = "ACTIVE";
                if (notes) existingAmbassador.notes = notes;
                await existingAmbassador.save();

                user.isAmbassador = true;
                user.ambassadorRef = existingAmbassador._id;
                await user.save();

                return res.status(200).json({
                    message: "Campus Ambassador reactivated successfully",
                    ambassador: existingAmbassador
                });
            }
            return res.status(409).json({ message: "This user is already an active Campus Ambassador" });
        }

        let referralCode = "";
        if (customCode && customCode.trim()) {
            const clean = sanitizeString(customCode.trim());
            if (clean.length < 3 || clean.length > 20) {
                return res.status(400).json({ message: "Custom referral code must be between 3 and 20 alphanumeric characters" });
            }
            const codeTaken = await CampusAmbassador.findOne({ referralCode: clean });
            if (codeTaken) {
                return res.status(409).json({ message: `Referral code "${clean}" is already in use. Please choose another.` });
            }
            referralCode = clean;
        } else {
            referralCode = await generateUniqueReferralCode(user);
        }

        const ambassador = await CampusAmbassador.create({
            user: user._id,
            referralCode,
            status: "ACTIVE",
            college: user.collegeName || "",
            assignedBy: req.user?._id || null,
            assignedAt: new Date(),
            notes: notes || ""
        });

        user.isAmbassador = true;
        user.ambassadorRef = ambassador._id;
        await user.save();

        const populated = await CampusAmbassador.findById(ambassador._id)
            .populate("user", "fullName username email avatar collegeName")
            .lean();

        return res.status(201).json({
            message: `Campus Ambassador assigned successfully with referral code: ${referralCode}`,
            ambassador: populated
        });
    } catch (error) {
        console.error("assignAmbassador error:", error);
        return res.status(500).json({ message: error.message || "Server error assigning ambassador" });
    }
}

/**
 * PUT /api/admin/ambassadors/:id
 * Update status, change/regenerate referral code, edit notes
 */
async function updateAmbassador(req, res) {
    try {
        const { id } = req.params;
        const { status, referralCode, regenerateCode, notes } = req.body;

        const ambassador = await CampusAmbassador.findById(id).populate("user");
        if (!ambassador) {
            return res.status(404).json({ message: "Campus Ambassador not found" });
        }

        if (status && ["ACTIVE", "INACTIVE", "REVOKED"].includes(status.toUpperCase())) {
            ambassador.status = status.toUpperCase();
            if (status.toUpperCase() === "INACTIVE" || status.toUpperCase() === "REVOKED") {
                ambassador.deactivatedAt = new Date();
                if (ambassador.user) {
                    await userModel.findByIdAndUpdate(ambassador.user._id, { isAmbassador: false });
                }
            } else if (status.toUpperCase() === "ACTIVE") {
                ambassador.deactivatedAt = null;
                if (ambassador.user) {
                    await userModel.findByIdAndUpdate(ambassador.user._id, { isAmbassador: true });
                }
            }
        }

        if (regenerateCode) {
            ambassador.referralCode = await generateUniqueReferralCode(ambassador.user);
        } else if (referralCode && referralCode.trim()) {
            const clean = sanitizeString(referralCode.trim());
            if (clean !== ambassador.referralCode) {
                const codeTaken = await CampusAmbassador.findOne({ referralCode: clean, _id: { $ne: ambassador._id } });
                if (codeTaken) {
                    return res.status(409).json({ message: `Referral code "${clean}" is already in use by another ambassador.` });
                }
                ambassador.referralCode = clean;
            }
        }

        if (notes !== undefined) {
            ambassador.notes = notes;
        }

        await ambassador.save();

        const updated = await CampusAmbassador.findById(id)
            .populate("user", "fullName username email avatar collegeName isAmbassador")
            .populate("assignedBy", "username fullName")
            .lean();

        return res.status(200).json({
            message: "Ambassador details updated successfully",
            ambassador: updated
        });
    } catch (error) {
        console.error("updateAmbassador error:", error);
        return res.status(500).json({ message: "Server error updating ambassador" });
    }
}

/**
 * DELETE /api/admin/ambassadors/:id
 * Revoke ambassador status
 */
async function revokeAmbassador(req, res) {
    try {
        const { id } = req.params;
        const ambassador = await CampusAmbassador.findById(id);
        if (!ambassador) {
            return res.status(404).json({ message: "Campus Ambassador not found" });
        }

        ambassador.status = "REVOKED";
        ambassador.deactivatedAt = new Date();
        await ambassador.save();

        if (ambassador.user) {
            await userModel.findByIdAndUpdate(ambassador.user, { isAmbassador: false });
        }

        return res.status(200).json({
            message: "Campus Ambassador role revoked successfully"
        });
    } catch (error) {
        console.error("revokeAmbassador error:", error);
        return res.status(500).json({ message: "Server error revoking ambassador" });
    }
}

/**
 * GET /api/admin/ambassadors/analytics/overview
 * System-wide metrics across all Campus Ambassadors
 */
async function getAmbassadorAnalytics(req, res) {
    try {
        const now = new Date();
        const [totalAmbassadors, activeAmbassadors, totalReferralsCount] = await Promise.all([
            CampusAmbassador.countDocuments({ status: { $ne: "REVOKED" } }),
            CampusAmbassador.countDocuments({ status: "ACTIVE" }),
            Referral.countDocuments()
        ]);

        const allReferrals = await Referral.find()
            .populate("referredUser", "isVerified verificationStatus isPremium premiumExpireAt")
            .lean();

        let totalVerifiedReferrals = 0;
        let totalPremiumReferrals = 0;
        let totalActivePremiumReferrals = 0;

        for (const ref of allReferrals) {
            const u = ref.referredUser;
            if (!u) continue;
            if (u.isVerified || u.verificationStatus === "VERIFIED") {
                totalVerifiedReferrals++;
            }
            if (u.isPremium) {
                totalPremiumReferrals++;
                if (u.premiumExpireAt && new Date(u.premiumExpireAt) > now) {
                    totalActivePremiumReferrals++;
                }
            }
        }

        const overallVerificationRate = totalReferralsCount > 0
            ? Math.round((totalVerifiedReferrals / totalReferralsCount) * 100)
            : 0;

        const overallPremiumRate = totalReferralsCount > 0
            ? Math.round((totalPremiumReferrals / totalReferralsCount) * 100)
            : 0;

        return res.status(200).json({
            analytics: {
                totalAmbassadors,
                activeAmbassadors,
                totalReferralRegistrations: totalReferralsCount,
                totalVerifiedReferrals,
                totalPremiumReferrals,
                totalActivePremiumReferrals,
                overallVerificationRate,
                overallPremiumRate
            }
        });
    } catch (error) {
        console.error("getAmbassadorAnalytics error:", error);
        return res.status(500).json({ message: "Server error loading analytics" });
    }
}

/**
 * GET /api/admin/ambassadors/leaderboard
 * Ranked leaderboard of ambassadors
 */
async function getAmbassadorLeaderboard(req, res) {
    try {
        const ambassadors = await CampusAmbassador.find({ status: "ACTIVE" })
            .populate("user", "fullName username avatar collegeName")
            .lean();

        const ambassadorIds = ambassadors.map(a => a._id);
        const statsMap = await computeAmbassadorStats(ambassadorIds);

        const ranked = ambassadors.map(a => ({
            _id: a._id,
            referralCode: a.referralCode,
            college: a.college || a.user?.collegeName || "Campus",
            user: {
                _id: a.user?._id,
                fullName: a.user?.fullName || a.user?.username,
                username: a.user?.username,
                avatar: a.user?.avatar || ""
            },
            metrics: statsMap[String(a._id)] || {
                totalReferrals: 0,
                verifiedReferrals: 0,
                premiumReferrals: 0,
                activePremiumReferrals: 0,
                conversionRate: 0
            }
        }));

        // Sort primarily by verified referrals, then total referrals
        ranked.sort((a, b) => {
            if (b.metrics.verifiedReferrals !== a.metrics.verifiedReferrals) {
                return b.metrics.verifiedReferrals - a.metrics.verifiedReferrals;
            }
            return b.metrics.totalReferrals - a.metrics.totalReferrals;
        });

        const top10 = ranked.slice(0, 15).map((item, index) => ({
            rank: index + 1,
            ...item
        }));

        return res.status(200).json({ leaderboard: top10 });
    } catch (error) {
        console.error("getAmbassadorLeaderboard error:", error);
        return res.status(500).json({ message: "Server error generating leaderboard" });
    }
}

module.exports = {
    listAmbassadors,
    getAmbassadorDetails,
    assignAmbassador,
    updateAmbassador,
    revokeAmbassador,
    getAmbassadorAnalytics,
    getAmbassadorLeaderboard
};
