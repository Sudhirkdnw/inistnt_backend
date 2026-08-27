const CampusAmbassador = require("../models/campusAmbassador.model");
const Referral = require("../models/referral.model");
const userModel = require("../models/user.model");

/**
 * GET /api/referrals/validate/:code
 * Public validation endpoint for checking referral codes during registration
 */
async function validateReferralCode(req, res) {
    try {
        const { code } = req.params;
        if (!code || !code.trim()) {
            return res.status(400).json({ valid: false, message: "Referral code is required" });
        }

        const cleanCode = code.trim().toUpperCase();
        const ambassador = await CampusAmbassador.findOne({ referralCode: cleanCode, status: "ACTIVE" })
            .populate("user", "fullName username collegeName avatar")
            .lean();

        if (!ambassador || !ambassador.user) {
            return res.status(404).json({
                valid: false,
                message: "Invalid referral code. Please check and try again."
            });
        }

        return res.status(200).json({
            valid: true,
            ambassador: {
                name: ambassador.user.fullName || ambassador.user.username,
                username: ambassador.user.username,
                college: ambassador.college || ambassador.user.collegeName,
                referralCode: ambassador.referralCode
            }
        });
    } catch (error) {
        console.error("validateReferralCode error:", error);
        return res.status(500).json({ valid: false, message: "Server error during referral code validation" });
    }
}

/**
 * GET /api/ambassador/profile
 * Returns the ambassador's profile and live derived analytics
 */
async function getMyAmbassadorProfile(req, res) {
    try {
        const userId = req.user._id;
        const ambassador = await CampusAmbassador.findOne({ user: userId })
            .populate("user", "fullName username email avatar collegeName verificationStatus")
            .lean();

        if (!ambassador) {
            return res.status(404).json({
                isAmbassador: false,
                message: "You are not registered as a Campus Ambassador."
            });
        }

        // Live stats calculation directly from DB (derived truth)
        const now = new Date();
        const referrals = await Referral.find({ ambassador: ambassador._id })
            .populate("referredUser", "isVerified verificationStatus isPremium premiumExpireAt")
            .lean();

        const totalReferrals = referrals.length;
        let verifiedReferrals = 0;
        let premiumReferrals = 0;
        let activePremiumReferrals = 0;

        for (const ref of referrals) {
            const u = ref.referredUser;
            if (!u) continue;
            if (u.isVerified || u.verificationStatus === "VERIFIED") {
                verifiedReferrals++;
            }
            if (u.isPremium) {
                premiumReferrals++;
                if (u.premiumExpireAt && new Date(u.premiumExpireAt) > now) {
                    activePremiumReferrals++;
                }
            }
        }

        const verificationRate = totalReferrals > 0 ? Math.round((verifiedReferrals / totalReferrals) * 100) : 0;
        const premiumRate = totalReferrals > 0 ? Math.round((premiumReferrals / totalReferrals) * 100) : 0;

        const shareMessage = `Join me on Hykee! 🚀\nIt's a platform to connect with students, discover your campus, join communities and find amazing people.\n\nUse my referral code: ${ambassador.referralCode} while signing up.`;
        const referralLink = `https://hykee.in/ref/${ambassador.referralCode}`;

        return res.status(200).json({
            isAmbassador: true,
            ambassador: {
                ...ambassador,
                shareMessage,
                referralLink
            },
            stats: {
                totalReferrals,
                verifiedReferrals,
                premiumReferrals,
                activePremiumReferrals,
                verificationRate,
                premiumRate
            }
        });
    } catch (error) {
        console.error("getMyAmbassadorProfile error:", error);
        return res.status(500).json({ message: "Server error loading ambassador dashboard" });
    }
}

/**
 * GET /api/ambassador/referrals
 * Returns paginated referred students for the authenticated ambassador
 */
async function getMyReferredUsers(req, res) {
    try {
        const userId = req.user._id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 15));
        const skip = (page - 1) * limit;

        const ambassador = await CampusAmbassador.findOne({ user: userId });
        if (!ambassador) {
            return res.status(403).json({ message: "Access denied. Ambassador profile not found." });
        }

        const [referrals, totalCount] = await Promise.all([
            Referral.find({ ambassador: ambassador._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("referredUser", "fullName username avatar collegeName verificationStatus isVerified isPremium premiumExpireAt createdAt")
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
            students: referredStudents,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit) || 1,
                totalCount,
                hasMore: page * limit < totalCount
            }
        });
    } catch (error) {
        console.error("getMyReferredUsers error:", error);
        return res.status(500).json({ message: "Server error fetching referred students" });
    }
}

module.exports = {
    validateReferralCode,
    getMyAmbassadorProfile,
    getMyReferredUsers
};
