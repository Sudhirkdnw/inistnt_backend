const { CampusConnectProfile, BRANCH_SKILLS } = require("../models/campusConnect.model");
const CampusConnectAction = require("../models/campusConnectAction.model");
const userModel = require("../models/user.model");
const notificationModel = require("../models/notification.model");
const { uploadImage, deleteImage } = require("../utils/cloudinary");

// ─── Compatibility Score Calculator ──────────────────────────────────────────
function computeCompatibility(myProfile, myUser, theirProfile, theirUser) {
    let score = 0;
    const reasons = [];

    // Same college (30 pts)
    if (
        myUser.collegeName &&
        theirUser.collegeName &&
        myUser.collegeName.trim().toLowerCase() === theirUser.collegeName.trim().toLowerCase()
    ) {
        score += 30;
        reasons.push("Same College");
    }

    // Same branch (15 pts)
    if (
        myUser.branch &&
        theirUser.branch &&
        myUser.branch.trim().toLowerCase() === theirUser.branch.trim().toLowerCase()
    ) {
        score += 15;
        reasons.push("Same Branch");
    }

    // Shared skills (max 20 pts — 4 pts each, up to 5)
    const sharedSkills = (myUser.skills || []).filter(s =>
        (theirUser.skills || []).map(x => x.toLowerCase()).includes(s.toLowerCase())
    );
    if (sharedSkills.length > 0) {
        const skillPts = Math.min(sharedSkills.length * 4, 20);
        score += skillPts;
        reasons.push(`${sharedSkills.slice(0, 3).join(", ")} Skills`);
    }

    // Shared interests (max 15 pts — 3 pts each, up to 5)
    const sharedInterests = (myUser.interests || []).filter(i =>
        (theirUser.interests || []).map(x => x.toLowerCase()).includes(i.toLowerCase())
    );
    if (sharedInterests.length > 0) {
        score += Math.min(sharedInterests.length * 3, 15);
        reasons.push(`${sharedInterests.slice(0, 2).join(", ")} Interests`);
    }

    // Shared goals (max 10 pts — 5 pts each, up to 2)
    const sharedGoals = (myUser.goals || []).filter(g =>
        (theirUser.goals || []).includes(g)
    );
    if (sharedGoals.length > 0) {
        score += Math.min(sharedGoals.length * 5, 10);
        reasons.push("Shared Goals");
    }

    // Shared intents (bonus 10 pts)
    const sharedIntents = (myProfile.intents || []).filter(i =>
        (theirProfile.intents || []).includes(i)
    );
    if (sharedIntents.length > 0) {
        score += Math.min(sharedIntents.length * 2, 10);
    }

    return {
        score: Math.min(score, 100),
        reasons: reasons.slice(0, 4)
    };
}

// ─── Setup / Update Profile ───────────────────────────────────────────────────
async function setupProfile(req, res) {
    try {
        const userId = req.user._id;
        const { intents, locationFilter, onboardingDone, mentorMode, mentorTags } = req.body;

        const user = await userModel.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Onboarding validation
        if (onboardingDone) {
            if (!user.photos || user.photos.length === 0) {
                return res.status(400).json({ message: "At least one profile photo is required to enter Campus Connect." });
            }
            if (!user.branch) {
                return res.status(400).json({ message: "Please specify your branch in your profile first." });
            }
        }

        let profile = await CampusConnectProfile.findOne({ user: userId });

        if (profile) {
            if (intents !== undefined) profile.intents = intents;
            if (locationFilter !== undefined) profile.locationFilter = locationFilter;
            if (onboardingDone !== undefined) profile.onboardingDone = onboardingDone;
            if (mentorMode !== undefined) profile.mentorMode = mentorMode;
            if (mentorTags !== undefined) profile.mentorTags = mentorTags;
            await profile.save();
        } else {
            profile = await CampusConnectProfile.create({
                user: userId,
                intents: intents || [],
                locationFilter: locationFilter || "my_college",
                onboardingDone: onboardingDone || false,
                mentorMode: false,
                mentorTags: []
            });
        }

        await profile.populate("user", "username fullName avatar collegeName verificationStatus branch semester skills interests goals photos");
        return res.status(200).json({ message: "Profile preferences saved", profile });
    } catch (err) {
        console.error("setupProfile error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Get My Profile ───────────────────────────────────────────────────────────
async function getMyProfile(req, res) {
    try {
        const profile = await CampusConnectProfile.findOne({ user: req.user._id })
            .populate("user", "username fullName avatar collegeName verificationStatus branch semester skills interests goals photos")
            .lean();

        if (!profile) {
            return res.status(200).json({ hasProfile: false, profile: null, branchSkills: BRANCH_SKILLS });
        }

        const userObj = profile.user || {};
        const branchSkills = BRANCH_SKILLS[userObj.branch] || BRANCH_SKILLS["Other"];
        return res.status(200).json({ hasProfile: true, profile, branchSkills, allBranchSkills: BRANCH_SKILLS });
    } catch (err) {
        console.error("getMyProfile error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Get Discovery Feed ───────────────────────────────────────────────────────
async function getDiscovery(req, res) {
    try {
        const { getSetting } = require("../utils/settings");
        if (!getSetting("campus_connect_module", true)) {
            return res.status(403).json({ message: "Campus Connect is currently disabled by administrator." });
        }

        const userId = req.user._id;
        const myProfile = await CampusConnectProfile.findOne({ user: userId }).lean();

        if (!myProfile) {
            return res.status(400).json({ message: "Please complete your Campus Connect profile first." });
        }

        const myUser = await userModel.findById(userId).select("collegeName branch semester skills interests goals photos").lean();

        // Fetch all user IDs already acted on by this user
        const actedOn = await CampusConnectAction.find({ actor: userId }).select("targetUser").lean();
        const actedOnIds = actedOn.map(a => a.targetUser);

        // Build location-aware query
        let collegeFilter = {};
        if (myProfile.locationFilter === "my_college" && myUser.collegeName) {
            // Only same college — look up users from same college
            const sameCollegeUsers = await userModel
                .find({ collegeName: myUser.collegeName, _id: { $ne: userId } })
                .select("_id")
                .lean();
            const sameCollegeIds = sameCollegeUsers.map(u => u._id);
            collegeFilter = { user: { $in: sameCollegeIds } };
        }

        // Fetch candidates
        let candidates = await CampusConnectProfile.find({
            isActive: true,
            user: { $nin: [userId, ...actedOnIds], ...((collegeFilter.user && myProfile.locationFilter === "my_college") ? {} : {}) },
            ...(myProfile.locationFilter === "my_college" && collegeFilter.user ? { user: { $in: collegeFilter.user.$in.filter(id => !actedOnIds.some(aid => String(aid) === String(id))) } } : { user: { $nin: [userId, ...actedOnIds] } }),
        })
            .select("user intents mentorMode onboardingDone")
            .limit(30)
            .populate("user", "username fullName avatar collegeName verificationStatus branch semester skills interests goals photos bio")
            .lean();

        // Filter orphaned profiles
        candidates = candidates.filter(c => c.user != null);

        // ── Relationship filter: only show relationship intent profiles
        // to users who also have relationship intent ──────────────────
        const myHasRelationship = myProfile.intents.includes("relationship");
        candidates = candidates.filter(c => {
            const theirHasRelationship = c.intents.includes("relationship");
            // If they ONLY have relationship intent, show only to relationship seekers
            if (c.intents.length === 1 && theirHasRelationship && !myHasRelationship) {
                return false;
            }
            return true;
        });

        // ── Compute compatibility scores ───────────────────────────────
        const scored = candidates.map(c => {
            const { score, reasons } = computeCompatibility(myProfile, myUser, c, c.user);
            return { ...c, compatibility: score, compatibilityReasons: reasons };
        });

        // ── Sort by compatibility score (desc) ─────────────────────────
        scored.sort((a, b) => b.compatibility - a.compatibility);

        return res.status(200).json({ candidates: scored });
    } catch (err) {
        console.error("getDiscovery error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Send Connect Request ─────────────────────────────────────────────────────
async function sendConnect(req, res) {
    try {
        const userId = req.user._id;
        const { targetUserId } = req.params;

        const myProfile = await CampusConnectProfile.findOne({ user: userId });
        const theirProfile = await CampusConnectProfile.findOne({ user: targetUserId });

        if (!myProfile || !theirProfile) {
            return res.status(404).json({ message: "Profile not found" });
        }

        // Upsert action
        await CampusConnectAction.findOneAndUpdate(
            { actor: userId, targetUser: targetUserId },
            { action: "connect" },
            { upsert: true, returnDocument: "after" }
        );

        // Check for mutual connect (both connected)
        const reciprocal = await CampusConnectAction.findOne({
            actor: targetUserId,
            targetUser: userId,
            action: "connect"
        });

        const isMutual = !!reciprocal;
        const meUser = await userModel.findById(userId).select("username fullName avatar").lean();

        if (isMutual) {
            // Mutual connection — notify both
            await notificationModel.create({
                recipient: targetUserId,
                sender: userId,
                type: "campus_connect_mutual",
                message: `🤝 You and ${meUser.username} are now connected on Campus Connect!`
            });

            const io = req.app.get("io");
            if (io) {
                const payload = {
                    type: "campus_connect_mutual",
                    sender: { _id: meUser._id, username: meUser.username, fullName: meUser.fullName, avatar: meUser.avatar },
                    message: `🤝 You and ${meUser.username} are now connected on Campus Connect!`,
                    createdAt: new Date().toISOString()
                };
                io.to(String(targetUserId)).emit("campus-connect-mutual", payload);
            }

            const { sendPushNotificationToUser } = require("../utils/pushNotifications");
            sendPushNotificationToUser(
                targetUserId,
                "New Connection! 🤝",
                `You and ${meUser.username} are now connected on Campus Connect!`,
                { type: "campus_connect_mutual", userId: userId.toString() }
            );
        } else {
            // One-way connect — notify target
            await notificationModel.create({
                recipient: targetUserId,
                sender: userId,
                type: "campus_connect_request",
                message: `👋 ${meUser.username} wants to connect with you on Campus Connect!`
            });

            const io = req.app.get("io");
            if (io) {
                const payload = {
                    type: "campus_connect_request",
                    sender: { _id: meUser._id, username: meUser.username, fullName: meUser.fullName, avatar: meUser.avatar },
                    message: `👋 ${meUser.username} wants to connect with you on Campus Connect!`,
                    createdAt: new Date().toISOString()
                };
                io.to(String(targetUserId)).emit("campus-connect-request", payload);
            }

            const { sendPushNotificationToUser } = require("../utils/pushNotifications");
            sendPushNotificationToUser(
                targetUserId,
                "New Connection Request 👋",
                `${meUser.username} wants to connect with you!`,
                { type: "campus_connect_request", userId: userId.toString() }
            );
        }

        return res.status(200).json({
            message: isMutual ? "You're now connected! 🤝" : "Connection request sent! 👋",
            isMutual
        });
    } catch (err) {
        console.error("sendConnect error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Send Hi (lightweight interaction) ───────────────────────────────────────
async function sendHi(req, res) {
    try {
        const userId = req.user._id;
        const { targetUserId } = req.params;

        await CampusConnectAction.findOneAndUpdate(
            { actor: userId, targetUser: targetUserId },
            { action: "hi" },
            { upsert: true, returnDocument: "after" }
        );

        const meUser = await userModel.findById(userId).select("username fullName avatar").lean();

        await notificationModel.create({
            recipient: targetUserId,
            sender: userId,
            type: "campus_connect_hi",
            message: `👋 ${meUser.username} said Hi to you on Campus Connect!`
        });

        const io = req.app.get("io");
        if (io) {
            io.to(String(targetUserId)).emit("campus-connect-hi", {
                type: "campus_connect_hi",
                sender: meUser,
                message: `👋 ${meUser.username} said Hi!`,
                createdAt: new Date().toISOString()
            });
        }

        return res.status(200).json({ message: "Hi sent! 👋" });
    } catch (err) {
        console.error("sendHi error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Save a Profile ───────────────────────────────────────────────────────────
async function saveProfile(req, res) {
    try {
        const userId = req.user._id;
        const { targetUserId } = req.params;

        await CampusConnectAction.findOneAndUpdate(
            { actor: userId, targetUser: targetUserId },
            { action: "save" },
            { upsert: true, returnDocument: "after" }
        );

        return res.status(200).json({ message: "Profile saved ⭐" });
    } catch (err) {
        console.error("saveProfile error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Pass / Hide Profile ──────────────────────────────────────────────────────
async function passProfile(req, res) {
    try {
        const userId = req.user._id;
        const { targetUserId } = req.params;

        await CampusConnectAction.findOneAndUpdate(
            { actor: userId, targetUser: targetUserId },
            { action: "pass" },
            { upsert: true, returnDocument: "after" }
        );

        return res.status(200).json({ message: "Passed" });
    } catch (err) {
        console.error("passProfile error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Get My Connections (mutual connects) ─────────────────────────────────────
async function getConnections(req, res) {
    try {
        const userId = req.user._id;

        // Find everyone I connected with
        const myConnects = await CampusConnectAction.find({ actor: userId, action: "connect" }).select("targetUser").lean();
        const myConnectIds = myConnects.map(a => a.targetUser);

        // Find everyone who connected back
        const mutualActions = await CampusConnectAction.find({
            actor: { $in: myConnectIds },
            targetUser: userId,
            action: "connect"
        }).select("actor").lean();

        const mutualIds = mutualActions.map(a => a.actor);

        // Also get saved profiles
        const savedActions = await CampusConnectAction.find({ actor: userId, action: "save" }).select("targetUser").lean();
        const savedIds = savedActions.map(a => a.targetUser);

        const [mutualProfiles, savedProfiles] = await Promise.all([
            CampusConnectProfile.find({ user: { $in: mutualIds } })
                .populate("user", "username fullName avatar collegeName verificationStatus")
                .lean(),
            CampusConnectProfile.find({ user: { $in: savedIds } })
                .populate("user", "username fullName avatar collegeName verificationStatus")
                .lean()
        ]);

        return res.status(200).json({
            connections: mutualProfiles.filter(p => p.user),
            saved: savedProfiles.filter(p => p.user)
        });
    } catch (err) {
        console.error("getConnections error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────
async function disconnect(req, res) {
    try {
        const userId = req.user._id;
        const { targetUserId } = req.params;

        await CampusConnectAction.deleteOne({ actor: userId, targetUser: targetUserId });

        return res.status(200).json({ message: "Disconnected" });
    } catch (err) {
        console.error("disconnect error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Get Team Finder Listings ─────────────────────────────────────────────────
async function getTeamFinder(req, res) {
    try {
        const userId = req.user._id;

        const listings = await CampusConnectProfile.find({
            "teamListing.isLooking": true,
            user: { $ne: userId }
        })
            .select("user branch teamListing skills")
            .populate("user", "username fullName avatar collegeName verificationStatus")
            .limit(50)
            .lean();

        return res.status(200).json({ listings: listings.filter(l => l.user) });
    } catch (err) {
        console.error("getTeamFinder error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Update Team Listing ──────────────────────────────────────────────────────
async function updateTeamListing(req, res) {
    try {
        const userId = req.user._id;
        const { isLooking, role, description, skills } = req.body;

        const profile = await CampusConnectProfile.findOne({ user: userId });
        if (!profile) {
            return res.status(404).json({ message: "Profile not found. Please complete onboarding first." });
        }

        profile.teamListing = {
            isLooking: isLooking !== undefined ? isLooking : profile.teamListing.isLooking,
            role: role || profile.teamListing.role,
            description: description || profile.teamListing.description,
            skills: skills || profile.teamListing.skills
        };

        await profile.save();
        return res.status(200).json({ message: "Team listing updated", profile });
    } catch (err) {
        console.error("updateTeamListing error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Get Mentors ──────────────────────────────────────────────────────────────
async function getMentors(req, res) {
    try {
        const userId = req.user._id;
        const { tag } = req.query;

        const filter = {
            mentorMode: true,
            user: { $ne: userId }
        };
        if (tag) filter.mentorTags = tag;

        const mentors = await CampusConnectProfile.find(filter)
            .select("user branch semester skills mentorTags bio")
            .populate("user", "username fullName avatar collegeName verificationStatus")
            .limit(40)
            .lean();

        return res.status(200).json({ mentors: mentors.filter(m => m.user) });
    } catch (err) {
        console.error("getMentors error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Toggle Mentor Mode ───────────────────────────────────────────────────────
async function toggleMentorMode(req, res) {
    try {
        const userId = req.user._id;
        const { mentorMode, mentorTags } = req.body;

        const profile = await CampusConnectProfile.findOne({ user: userId });
        if (!profile) {
            return res.status(404).json({ message: "Profile not found. Please complete onboarding first." });
        }

        profile.mentorMode = mentorMode !== undefined ? mentorMode : !profile.mentorMode;
        if (mentorTags) profile.mentorTags = mentorTags;
        await profile.save();

        return res.status(200).json({
            message: profile.mentorMode ? "Mentor mode enabled 🎓" : "Mentor mode disabled",
            profile
        });
    } catch (err) {
        console.error("toggleMentorMode error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Get Branch Skills ────────────────────────────────────────────────────────
async function getBranchSkills(req, res) {
    try {
        const { branch } = req.params;
        const skills = BRANCH_SKILLS[branch] || BRANCH_SKILLS["Other"];
        return res.status(200).json({ branch, skills, allBranches: Object.keys(BRANCH_SKILLS) });
    } catch (err) {
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Get CC Preferences ───────────────────────────────────────────────────────
async function getPreferences(req, res) {
    try {
        const profile = await CampusConnectProfile.findOne({ user: req.user._id }).lean();
        if (!profile) {
            return res.status(200).json({
                preferences: {
                    intents: [],
                    locationFilter: "my_college",
                    isActive: true,
                    preferredBranches: [],
                    preferredSemesters: [],
                    preferredSkills: [],
                    preferredInterests: [],
                    preferredCommunities: [],
                    verifiedOnly: false,
                    allowConnectionRequests: true,
                    allowMessagesAfterConnect: true,
                    showOnlineStatus: true,
                    hideFromSuggestions: false,
                    aiPriorities: ["skills", "interests", "goals", "branch", "semester", "communities", "mutuals"],
                    mentorMode: false,
                    mentorTags: []
                }
            });
        }
        return res.status(200).json({ preferences: profile });
    } catch (err) {
        console.error("getPreferences error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

// ─── Update CC Preferences ────────────────────────────────────────────────────
async function updatePreferences(req, res) {
    try {
        const userId = req.user._id;
        const {
            intents, locationFilter, isActive,
            preferredBranches, preferredSemesters, preferredSkills,
            preferredInterests, preferredCommunities,
            verifiedOnly, allowConnectionRequests, allowMessagesAfterConnect,
            showOnlineStatus, hideFromSuggestions, aiPriorities,
            mentorMode, mentorTags
        } = req.body;

        const VALID_AI = ["skills", "interests", "goals", "branch", "semester", "communities", "mutuals"];

        let profile = await CampusConnectProfile.findOne({ user: userId });
        if (!profile) {
            return res.status(404).json({ message: "Campus Connect profile not found. Please complete onboarding first." });
        }

        // Discovery intents & location
        if (intents !== undefined) profile.intents = intents;
        if (locationFilter !== undefined) profile.locationFilter = locationFilter;
        if (isActive !== undefined) profile.isActive = isActive;

        // Discovery filters (weights)
        if (preferredBranches !== undefined) profile.preferredBranches = preferredBranches;
        if (preferredSemesters !== undefined) profile.preferredSemesters = preferredSemesters;
        if (preferredSkills !== undefined) profile.preferredSkills = preferredSkills;
        if (preferredInterests !== undefined) profile.preferredInterests = preferredInterests;
        if (preferredCommunities !== undefined) profile.preferredCommunities = preferredCommunities;

        // Visibility & privacy
        if (verifiedOnly !== undefined) profile.verifiedOnly = verifiedOnly;
        if (allowConnectionRequests !== undefined) profile.allowConnectionRequests = allowConnectionRequests;
        if (allowMessagesAfterConnect !== undefined) profile.allowMessagesAfterConnect = allowMessagesAfterConnect;
        if (showOnlineStatus !== undefined) profile.showOnlineStatus = showOnlineStatus;
        if (hideFromSuggestions !== undefined) profile.hideFromSuggestions = hideFromSuggestions;

        // AI priorities — validate and set
        if (aiPriorities !== undefined) {
            const filtered = aiPriorities.filter(k => VALID_AI.includes(k));
            // ensure all keys present (append any missing at end)
            const missing = VALID_AI.filter(k => !filtered.includes(k));
            profile.aiPriorities = [...filtered, ...missing];
        }

        // Mentor
        if (mentorMode !== undefined) profile.mentorMode = mentorMode;
        if (mentorTags !== undefined) profile.mentorTags = mentorTags;

        await profile.save();
        return res.status(200).json({ message: "Preferences saved", preferences: profile });
    } catch (err) {
        console.error("updatePreferences error:", err);
        return res.status(500).json({ message: "Server error" });
    }
}

module.exports = {
    setupProfile,
    getMyProfile,
    getDiscovery,
    sendConnect,
    sendHi,
    saveProfile,
    passProfile,
    getConnections,
    disconnect,
    getTeamFinder,
    updateTeamListing,
    getMentors,
    toggleMentorMode,
    getBranchSkills,
    getPreferences,
    updatePreferences
};
