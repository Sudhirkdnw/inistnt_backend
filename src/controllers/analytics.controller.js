const mongoose = require("mongoose");
const AppInstallation = require("../models/appInstallation.model");
const userModel = require("../models/user.model");
const confessionModel = require("../models/confession.model");
const commentModel = require("../models/comment.model");
const communityModel = require("../models/community.model");
const communityMemberModel = require("../models/communityMember.model");
const teamModel = require("../models/team.model");
const teamApplicationModel = require("../models/teamApplication.model");
const CampusAmbassador = require("../models/campusAmbassador.model");
const Referral = require("../models/referral.model");
const { CampusConnectProfile } = require("../models/campusConnect.model");
const Subscription = require("../models/subscription.model");

/**
 * Helper: Parse start date from query (days or custom)
 */
function getFilterStartDate(query) {
    const days = parseInt(query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, days };
}

/**
 * POST /api/analytics/install
 * Public endpoint to record anonymous app installation or heartbeat
 */
async function recordInstallation(req, res) {
    try {
        const {
            installationId,
            platform = "unknown",
            appVersion = "1.0.0",
            buildNumber = "1",
            osVersion = "",
            deviceModel = "",
            userId = null
        } = req.body;

        if (!installationId || typeof installationId !== "string" || installationId.length < 5) {
            return res.status(400).json({ message: "Valid installationId is required" });
        }

        const cleanId = installationId.trim();
        const existing = await AppInstallation.findOne({ installationId: cleanId });

        if (existing) {
            existing.lastSeenAt = new Date();
            existing.sessionCount = (existing.sessionCount || 1) + 1;
            if (appVersion) existing.appVersion = appVersion;
            if (buildNumber) existing.buildNumber = buildNumber;
            if (osVersion) existing.osVersion = osVersion;
            if (deviceModel) existing.deviceModel = deviceModel;
            if (userId && mongoose.Types.ObjectId.isValid(userId)) existing.userId = userId;
            await existing.save();

            return res.status(200).json({
                status: "updated",
                isFirstInstall: false,
                installation: {
                    installationId: existing.installationId,
                    firstSeenAt: existing.firstSeenAt,
                    lastSeenAt: existing.lastSeenAt
                }
            });
        }

        // New anonymous installation
        const newInstall = await AppInstallation.create({
            installationId: cleanId,
            platform: ["android", "ios", "web"].includes(platform.toLowerCase()) ? platform.toLowerCase() : "unknown",
            appVersion,
            buildNumber,
            osVersion,
            deviceModel,
            userId: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            sessionCount: 1
        });

        return res.status(201).json({
            status: "recorded",
            isFirstInstall: true,
            installation: {
                installationId: newInstall.installationId,
                firstSeenAt: newInstall.firstSeenAt,
                lastSeenAt: newInstall.lastSeenAt
            }
        });
    } catch (error) {
        console.error("recordInstallation error:", error);
        return res.status(500).json({ message: "Server error recording installation" });
    }
}

/**
 * GET /api/analytics/overview
 * High-level business overview with real-time KPIs and growth velocities
 */
async function getOverview(req, res) {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [
            totalUsers,
            newUsersToday,
            newUsersThisWeek,
            newUsersThisMonth,
            dau,
            mau,
            totalInstalls,
            dailyActiveDevices,
            activePremiumUsers,
            totalCommunities,
            totalTeams
        ] = await Promise.all([
            userModel.countDocuments(),
            userModel.countDocuments({ createdAt: { $gte: todayStart } }),
            userModel.countDocuments({ createdAt: { $gte: weekStart } }),
            userModel.countDocuments({ createdAt: { $gte: monthStart } }),
            // DAU: users active in last 24h
            userModel.countDocuments({ lastActive: { $gte: dayAgo } }),
            // MAU: users active in last 30d
            userModel.countDocuments({ lastActive: { $gte: monthStart } }),
            // First Observed App Installations
            AppInstallation.countDocuments(),
            // Active Devices in last 24h
            AppInstallation.countDocuments({ lastSeenAt: { $gte: dayAgo } }),
            // Active Premium
            userModel.countDocuments({ isPremium: true, premiumExpireAt: { $gt: now } }),
            // Communities & Teams
            communityModel.countDocuments(),
            teamModel.countDocuments()
        ]);

        return res.status(200).json({
            overview: {
                totalUsers,
                newUsersToday,
                newUsersThisWeek,
                newUsersThisMonth,
                dau,
                mau,
                totalInstalls,
                dailyActiveDevices,
                activePremiumUsers,
                totalCommunities,
                totalTeams
            }
        });
    } catch (error) {
        console.error("getOverview error:", error);
        return res.status(500).json({ message: "Server error generating analytics overview" });
    }
}

/**
 * GET /api/analytics/users
 * User growth over time, registrations per day, verified vs unverified, college distribution
 */
async function getUsersAnalytics(req, res) {
    try {
        const { startDate } = getFilterStartDate(req.query);

        const [
            dailyRegistrations,
            verificationBreakdown,
            premiumBreakdown,
            topColleges,
            acquisitionBreakdown
        ] = await Promise.all([
            // Daily registrations
            userModel.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            // Verification breakdown
            userModel.aggregate([
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $or: [{ $eq: ["$isVerified", true] }, { $eq: ["$verificationStatus", "VERIFIED"] }] },
                                "Verified",
                                {
                                    $cond: [
                                        { $in: ["$verificationStatus", ["pending", "PENDING"]] },
                                        "Pending",
                                        "Unverified"
                                    ]
                                }
                            ]
                        },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Premium vs Free
            userModel.aggregate([
                {
                    $group: {
                        _id: { $cond: ["$isPremium", "Premium", "Free"] },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Top Colleges
            userModel.aggregate([
                { $match: { collegeName: { $exists: true, $ne: "" } } },
                { $group: { _id: "$collegeName", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            // Referral vs Organic
            userModel.aggregate([
                {
                    $group: {
                        _id: { $cond: [{ $ifNull: ["$referredBy", false] }, "Referral", "Organic"] },
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        return res.status(200).json({
            dailyRegistrations,
            verificationBreakdown,
            premiumBreakdown,
            topColleges,
            acquisitionBreakdown
        });
    } catch (error) {
        console.error("getUsersAnalytics error:", error);
        return res.status(500).json({ message: "Server error loading users analytics" });
    }
}

/**
 * GET /api/analytics/activity
 * DAU / WAU / MAU, Active Devices, Session trends, and App Version distribution
 */
async function getActivityAnalytics(req, res) {
    try {
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const { startDate } = getFilterStartDate(req.query);

        const [
            dau,
            wau,
            mau,
            dailyActiveDevices,
            weeklyActiveDevices,
            monthlyActiveDevices,
            dailyActiveUsersTrend,
            dailyActiveDevicesTrend,
            versionDistribution,
            platformDistribution
        ] = await Promise.all([
            // Active authenticated users
            userModel.countDocuments({ lastActive: { $gte: dayAgo } }),
            userModel.countDocuments({ lastActive: { $gte: weekAgo } }),
            userModel.countDocuments({ lastActive: { $gte: monthAgo } }),
            // Active devices
            AppInstallation.countDocuments({ lastSeenAt: { $gte: dayAgo } }),
            AppInstallation.countDocuments({ lastSeenAt: { $gte: weekAgo } }),
            AppInstallation.countDocuments({ lastSeenAt: { $gte: monthAgo } }),
            // Active users trend
            userModel.aggregate([
                { $match: { lastActive: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$lastActive" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            // Active devices trend
            AppInstallation.aggregate([
                { $match: { lastSeenAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$lastSeenAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            // Version distribution
            AppInstallation.aggregate([
                { $group: { _id: "$appVersion", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 8 }
            ]),
            // Platform distribution
            AppInstallation.aggregate([
                { $group: { _id: "$platform", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        return res.status(200).json({
            dau,
            wau,
            mau,
            dailyActiveDevices,
            weeklyActiveDevices,
            monthlyActiveDevices,
            dailyActiveUsersTrend,
            dailyActiveDevicesTrend,
            versionDistribution,
            platformDistribution
        });
    } catch (error) {
        console.error("getActivityAnalytics error:", error);
        return res.status(500).json({ message: "Server error loading activity analytics" });
    }
}

/**
 * GET /api/analytics/acquisition
 * Acquisition funnels and referral attribution
 */
async function getAcquisitionFunnel(req, res) {
    try {
        const [
            firstObservedInstalls,
            totalRegistrations,
            verifiedUsers,
            premiumUsers,
            referralSignups,
            campusAmbassadorCount
        ] = await Promise.all([
            AppInstallation.countDocuments(),
            userModel.countDocuments(),
            userModel.countDocuments({ $or: [{ isVerified: true }, { verificationStatus: "VERIFIED" }] }),
            userModel.countDocuments({ isPremium: true }),
            Referral.countDocuments(),
            CampusAmbassador.countDocuments({ status: "ACTIVE" })
        ]);

        const organicSignups = Math.max(0, totalRegistrations - referralSignups);

        const funnel = [
            { stage: "First App Open / Installs", count: firstObservedInstalls, step: 1 },
            { stage: "Registration Completed", count: totalRegistrations, step: 2 },
            { stage: "Student ID / Email Verified", count: verifiedUsers, step: 3 },
            { stage: "Premium Membership", count: premiumUsers, step: 4 }
        ];

        return res.status(200).json({
            funnel,
            attribution: {
                organicSignups,
                referralSignups,
                campusAmbassadorCount,
                referralShare: totalRegistrations > 0 ? Math.round((referralSignups / totalRegistrations) * 100) : 0
            }
        });
    } catch (error) {
        console.error("getAcquisitionFunnel error:", error);
        return res.status(500).json({ message: "Server error loading acquisition funnel" });
    }
}

/**
 * GET /api/analytics/features
 * Usage breakdown across Campus Connect, Communities, Team Finder, Confessions
 */
async function getFeatureAnalytics(req, res) {
    try {
        const { startDate } = getFilterStartDate(req.query);

        const [
            campusConnectCount,
            communitiesCount,
            communityMemberships,
            teamsCount,
            teamApplicationsCount,
            acceptedTeamApplications,
            confessionsCount,
            commentsCount,
            confessionsTrend
        ] = await Promise.all([
            CampusConnectProfile.countDocuments(),
            communityModel.countDocuments(),
            communityMemberModel.countDocuments(),
            teamModel.countDocuments(),
            teamApplicationModel.countDocuments(),
            teamApplicationModel.countDocuments({ status: "ACCEPTED" }),
            confessionModel.countDocuments(),
            commentModel.countDocuments(),
            confessionModel.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ])
        ]);

        return res.status(200).json({
            features: {
                campusConnect: {
                    totalProfiles: campusConnectCount
                },
                communities: {
                    totalCommunities: communitiesCount,
                    totalMemberships: communityMemberships,
                    avgMembersPerCommunity: communitiesCount > 0 ? Math.round(communityMemberships / communitiesCount) : 0
                },
                teamFinder: {
                    totalTeams: teamsCount,
                    totalApplications: teamApplicationsCount,
                    acceptedApplications: acceptedTeamApplications,
                    acceptanceRate: teamApplicationsCount > 0 ? Math.round((acceptedTeamApplications / teamApplicationsCount) * 100) : 0
                },
                social: {
                    totalConfessions: confessionsCount,
                    totalComments: commentsCount,
                    trend: confessionsTrend
                }
            }
        });
    } catch (error) {
        console.error("getFeatureAnalytics error:", error);
        return res.status(500).json({ message: "Server error loading feature analytics" });
    }
}

/**
 * GET /api/analytics/technical-health
 * Platform distribution, app versions, and system uptime
 */
async function getTechnicalHealth(req, res) {
    try {
        const now = new Date();
        const active24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [activeVersions, platformBreakdown, totalDevices] = await Promise.all([
            AppInstallation.aggregate([
                { $match: { lastSeenAt: { $gte: active24h } } },
                { $group: { _id: "$appVersion", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            AppInstallation.aggregate([
                { $group: { _id: "$platform", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            AppInstallation.countDocuments()
        ]);

        return res.status(200).json({
            health: {
                serverUptimeSeconds: Math.floor(process.uptime()),
                serverTimestamp: new Date().toISOString(),
                nodeVersion: process.version,
                memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                activeVersionsLast24h: activeVersions,
                platformBreakdown,
                totalRecordedDevices: totalDevices
            }
        });
    } catch (error) {
        console.error("getTechnicalHealth error:", error);
        return res.status(500).json({ message: "Server error loading technical health" });
    }
}

module.exports = {
    recordInstallation,
    getOverview,
    getUsersAnalytics,
    getActivityAnalytics,
    getAcquisitionFunnel,
    getFeatureAnalytics,
    getTechnicalHealth
};
