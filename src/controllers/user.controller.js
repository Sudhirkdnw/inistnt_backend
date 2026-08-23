const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");
const notificationModel = require("../models/notification.model");
const Confession = require("../models/confession.model");
const Comment = require("../models/comment.model");
const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const { uploadAvatar } = require('../utils/cloudinary');
const { getPremiumSettingsCached } = require("../utils/premiumSettingsCache");
const { invalidateUserCache } = require("../middlewares/cacheMiddleware");
const crypto = require("crypto");
const { sendVerificationEmail } = require("../services/emailService");

// GET /api/users/:id — Get user profile
async function getUserProfile(req, res) {
    try {
        const user = await userModel.findById(req.params.id)
            .select("username fullName bio avatar followers following isPrivate isVerified collegeName createdAt isPremium followRequests coverPhoto university department branch semester gradYear skills interests goals github linkedin portfolio resume achievements certifications communitiesJoined photos gender dob pronouns website languages showOnlineStatus hideFromSuggestions isEmailVerified")
            .populate("followers", "username fullName avatar isVerified")
            .populate("following", "username fullName avatar isVerified")
            .lean();

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const currentUserId = req.user._id.toString();
        const targetUserId = user._id.toString();
        const isOwner = currentUserId === targetUserId;

        const isFollowing = (user.followers || []).some(f => (f._id || f).toString() === currentUserId);
        const isFollower = (user.following || []).some(f => (f._id || f).toString() === currentUserId);
        const isMutualFollow = isFollowing && isFollower;
        const isRequested = (user.followRequests || []).some(f => (f._id || f).toString() === currentUserId);

        const followersCount = (user.followers || []).length;
        const followingCount = (user.following || []).length;

        let responseUser = {
            ...user,
            followersCount,
            followingCount,
            isFollowingUser: isFollowing,
            isFollowerUser: isFollower,
            isMutualFollow: isMutualFollow,
            isRequestedUser: isRequested
        };

        // Compute Mutual Connections (users both current user and target user follow)
        let mutualConnections = [];
        if (!isOwner) {
            const currentUserFull = await userModel.findById(req.user._id).select("following").lean();
            const myFollowing = (currentUserFull?.following || []).map(id => id.toString());
            const theirFollowing = (user.following || []).map(f => (f._id || f).toString());
            const mutualIds = myFollowing.filter(id => theirFollowing.includes(id));
            
            if (mutualIds.length > 0) {
                mutualConnections = await userModel.find({ _id: { $in: mutualIds } })
                    .select("username fullName avatar isVerified")
                    .limit(10)
                    .lean();
            }
        }

        // Compute Friends (mutual followers of the target user)
        const followerIds = (user.followers || []).map(f => (f._id || f).toString());
        const followingIds = (user.following || []).map(f => (f._id || f).toString());
        const mutualFollowIds = followerIds.filter(id => followingIds.includes(id));
        let friends = [];
        if (mutualFollowIds.length > 0) {
            friends = await userModel.find({ _id: { $in: mutualFollowIds } })
                .select("username fullName avatar isVerified")
                .limit(10)
                .lean();
        }

        // Query Activity Stats
        const confessionsCount = await Confession.countDocuments({ user: targetUserId, isSoftDeleted: { $ne: true } });
        const postModel = require("../models/post.model");
        const postsCount = await postModel.countDocuments({ user: targetUserId });
        const commentsCount = await Comment.countDocuments({ user: targetUserId });

        responseUser.stats = {
            confessionsCount,
            postsCount,
            commentsCount
        };
        responseUser.friends = friends;
        responseUser.mutualConnections = mutualConnections;

        // Privacy Guard: If account is private and viewer is neither owner nor accepted follower
        if (responseUser.isPrivate && !isOwner && !isFollowing) {
            // Keep numerical stats visible (standard Instagram UX)
            responseUser.followers = [];
            responseUser.following = [];
            responseUser.bio = user.bio || "";
            responseUser.skills = [];
            responseUser.interests = [];
            responseUser.goals = [];
            responseUser.github = "";
            responseUser.linkedin = "";
            responseUser.portfolio = "";
            responseUser.resume = "";
            responseUser.achievements = [];
            responseUser.certifications = [];
            responseUser.communitiesJoined = [];
            responseUser.isPrivateHidden = true; // Lock indicator for frontend
            responseUser.photos = [];
        } else {
            responseUser.isPrivateHidden = false;
        }

        res.status(200).json({ user: responseUser });
    } catch (error) {
        console.error("getUserProfile error:", error);
        res.status(500).json({ message: error.message });
    }
}

// PUT /api/users/edit — Update own profile
async function updateProfile(req, res) {
    try {
        const { username, fullName, bio, avatar, isPrivate, email } = req.body;

        const { containsPhoneNumber } = require("../utils/phoneFilter");
        if (bio && containsPhoneNumber(bio)) {
            return res.status(400).json({ message: "Sharing phone numbers is not allowed in bio." });
        }
        const user = await userModel.findById(req.user._id).select("+password");

        if (!user) return res.status(404).json({ message: "User not found" });

        // If username is being changed, check uniqueness
        if (username !== undefined && username.trim() && username.toLowerCase().trim() !== user.username) {
            const newUsername = username.toLowerCase().trim();
            const existing = await userModel.findOne({
                username: newUsername,
                _id: { $ne: req.user._id }
            });
            if (existing) {
                return res.status(409).json({ message: "Username is already taken" });
            }
            user.username = newUsername;
        }

        // If email is being changed, check uniqueness and reset verification
        if (email !== undefined && email.trim() && email.toLowerCase().trim() !== user.email) {
            const newEmail = email.toLowerCase().trim();
            const existing = await userModel.findOne({
                email: newEmail,
                _id: { $ne: req.user._id }
            });
            if (existing) {
                return res.status(409).json({ message: "Email is already in use" });
            }
            user.email = newEmail;
            user.isEmailVerified = false;
            user.emailVerificationToken = undefined;
            user.emailVerificationExpire = undefined;
        }

        if (fullName !== undefined) user.fullName = fullName;
        if (bio !== undefined) user.bio = bio;
        if (avatar !== undefined) user.avatar = avatar;
        if (isPrivate !== undefined) user.isPrivate = isPrivate;
        if (req.body.notificationSoundEnabled !== undefined) {
            user.notificationSoundEnabled = !!req.body.notificationSoundEnabled;
        }

        // Student identity fields
        if (req.body.coverPhoto !== undefined) user.coverPhoto = req.body.coverPhoto;

        const University = require("../models/university.model");
        const College = require("../models/college.model");
        const mongoose = require("mongoose");

        if (req.body.university !== undefined || req.body.universityId !== undefined) {
            const rawUniId = req.body.universityId;
            const rawUniName = req.body.university;
            if (rawUniId && mongoose.Types.ObjectId.isValid(rawUniId)) {
                const uDoc = await University.findById(rawUniId);
                if (uDoc) {
                    user.universityId = uDoc._id;
                    user.university = uDoc.name;
                } else {
                    user.university = rawUniName || "";
                    user.universityId = null;
                }
            } else if (rawUniName && rawUniName.trim()) {
                const uDoc = await University.findOne({ name: new RegExp(`^${rawUniName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
                if (uDoc) {
                    user.universityId = uDoc._id;
                    user.university = uDoc.name;
                } else {
                    user.university = rawUniName.trim();
                    user.universityId = null;
                }
            } else {
                user.university = "";
                user.universityId = null;
            }
        }

        if (req.body.collegeName !== undefined || req.body.collegeId !== undefined) {
            const rawColId = req.body.collegeId;
            const rawColName = req.body.collegeName;
            if (rawColId && mongoose.Types.ObjectId.isValid(rawColId)) {
                const cDoc = await College.findById(rawColId);
                if (cDoc) {
                    user.collegeId = cDoc._id;
                    user.collegeName = cDoc.name;
                    if (!user.universityId && cDoc.university) {
                        user.universityId = cDoc.university;
                        const uDoc = await University.findById(cDoc.university);
                        if (uDoc) user.university = uDoc.name;
                    }
                } else {
                    user.collegeName = rawColName || "";
                    user.collegeId = null;
                }
            } else if (rawColName && rawColName.trim()) {
                const cDoc = await College.findOne({ name: new RegExp(`^${rawColName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
                if (cDoc) {
                    user.collegeId = cDoc._id;
                    user.collegeName = cDoc.name;
                    if (!user.universityId && cDoc.university) {
                        user.universityId = cDoc.university;
                        const uDoc = await University.findById(cDoc.university);
                        if (uDoc) user.university = uDoc.name;
                    }
                } else {
                    user.collegeName = rawColName.trim();
                    user.collegeId = null;
                }
            } else {
                user.collegeName = "";
                user.collegeId = null;
            }
        }

        if (req.body.department !== undefined) user.department = req.body.department;
        if (req.body.branch !== undefined) user.branch = req.body.branch;
        if (req.body.semester !== undefined) user.semester = req.body.semester ? Number(req.body.semester) : null;
        if (req.body.gradYear !== undefined) user.gradYear = req.body.gradYear ? Number(req.body.gradYear) : null;
        if (req.body.skills !== undefined) user.skills = req.body.skills;
        if (req.body.interests !== undefined) user.interests = req.body.interests;
        if (req.body.goals !== undefined) user.goals = req.body.goals;
        if (req.body.github !== undefined) user.github = req.body.github;
        if (req.body.linkedin !== undefined) user.linkedin = req.body.linkedin;
        if (req.body.portfolio !== undefined) user.portfolio = req.body.portfolio;
        if (req.body.resume !== undefined) user.resume = req.body.resume;
        if (req.body.achievements !== undefined) user.achievements = req.body.achievements;
        if (req.body.certifications !== undefined) user.certifications = req.body.certifications;
        if (req.body.communitiesJoined !== undefined) user.communitiesJoined = req.body.communitiesJoined;
        // Extended identity
        if (req.body.gender !== undefined) user.gender = req.body.gender;
        if (req.body.dob !== undefined) user.dob = req.body.dob || null;
        if (req.body.pronouns !== undefined) user.pronouns = req.body.pronouns;
        if (req.body.website !== undefined) user.website = req.body.website;
        if (req.body.languages !== undefined) user.languages = req.body.languages;
        if (req.body.showOnlineStatus !== undefined) user.showOnlineStatus = req.body.showOnlineStatus;
        if (req.body.hideFromSuggestions !== undefined) user.hideFromSuggestions = req.body.hideFromSuggestions;

        await user.save();

        res.status(200).json({ 
            message: "Profile updated", 
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar,
                bio: user.bio,
                isPrivate: user.isPrivate,
                isEmailVerified: user.isEmailVerified,
                notificationSoundEnabled: user.notificationSoundEnabled,
                coverPhoto: user.coverPhoto,
                collegeName: user.collegeName,
                university: user.university,
                department: user.department,
                branch: user.branch,
                semester: user.semester,
                gradYear: user.gradYear,
                skills: user.skills,
                interests: user.interests,
                goals: user.goals,
                github: user.github,
                linkedin: user.linkedin,
                portfolio: user.portfolio,
                resume: user.resume,
                achievements: user.achievements,
                certifications: user.certifications,
                communitiesJoined: user.communitiesJoined,
                photos: user.photos,
                gender: user.gender,
                dob: user.dob,
                pronouns: user.pronouns,
                website: user.website,
                languages: user.languages,
                showOnlineStatus: user.showOnlineStatus,
                hideFromSuggestions: user.hideFromSuggestions
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/users/request-verification
async function requestEmailVerification(req, res) {
    console.log(`➡️ [API Route Execution] requestEmailVerification called by User ID: ${req.user?._id}`);
    try {
        const user = await userModel.findById(req.user._id);
        if (!user) {
            console.warn("⚠️ [requestEmailVerification] Authenticated user not found in database");
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.email) {
            console.warn(`⚠️ [requestEmailVerification] Blocked verification request: User @${user.username} has no email set`);
            return res.status(400).json({ message: "Please add an email address first" });
        }
        if (user.isEmailVerified) {
            console.warn(`⚠️ [requestEmailVerification] Blocked verification request: User @${user.username} email already verified`);
            return res.status(400).json({ message: "Email is already verified" });
        }

        // Rate limit: check if a token was sent recently (e.g., last 2 minutes)
        if (user.emailVerificationExpire && (user.emailVerificationExpire - Date.now() > 8 * 60 * 1000)) {
            console.warn(`⚠️ [requestEmailVerification] Rate limit blocked recovery code request for user @${user.username}`);
            return res.status(429).json({ message: "Please wait a few minutes before requesting another code" });
        }

        let otp;
        try {
            otp = Math.floor(100000 + Math.random() * 900000).toString();
            user.emailVerificationToken = crypto.createHash("sha256").update(otp).digest("hex");
            user.emailVerificationExpire = Date.now() + 10 * 60 * 1000; // 10 mins
            console.log(`🔑 [requestEmailVerification] Generated verification OTP for user @${user.username}: ${otp}`);
            await user.save();
        } catch (tokenErr) {
            console.error(`❌ [requestEmailVerification] Token generation/save failure for @${user.username}:`, tokenErr.message);
            throw new Error(`Token generation failed: ${tokenErr.message}`);
        }

        // Send verification email in background (non-blocking)
        console.log(`📨 [requestEmailVerification] Queuing verification email for: ${user.email}`);
        sendVerificationEmail(user.email, otp, user.username)
            .then(() => {
                console.log(`📩 [requestEmailVerification] Background verification email successfully queued for: ${user.email}`);
            })
            .catch((err) => {
                console.error(`❌ [requestEmailVerification] Failed to queue background verification email for ${user.email}:`, err.message);
            });

        res.status(200).json({ message: "Verification code sent to your email" });
    } catch (error) {
        console.error("❌ [requestEmailVerification] Fatal execution error:", error.message);
        res.status(500).json({ message: error.message });
    }
}

// POST /api/users/verify-email
async function verifyEmail(req, res) {
    try {
        const { otp } = req.body;
        if (!otp) return res.status(400).json({ message: "Verification code is required" });

        const hashedToken = crypto.createHash("sha256").update(otp).digest("hex");
        const user = await userModel.findOne({
            _id: req.user._id,
            emailVerificationToken: hashedToken,
            emailVerificationExpire: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ message: "Invalid or expired verification code" });

        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpire = undefined;
        await user.save();

        res.status(200).json({
            message: "Email verified successfully!",
            isEmailVerified: true,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                isEmailVerified: true,
                isVerified: user.isVerified,
                verificationStatus: user.verificationStatus,
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// PUT /api/users/avatar — Upload avatar
async function updateAvatar(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No image provided" });
        }

        // Upload to Cloudinary (or base64 fallback if Cloudinary not configured)
        const avatarUrl = await uploadAvatar(req.file.buffer, req.file.mimetype);

        const user = await userModel.findByIdAndUpdate(
            req.user._id,
            { avatar: avatarUrl },
            { returnDocument: 'after' }
        ).select("username fullName bio avatar isPrivate isVerified");

        res.status(200).json({ message: "Avatar updated", user });
    } catch (error) {
        console.error('❌ Avatar upload error:', error.message);
        res.status(500).json({ message: error.message });
    }
}

// POST /api/users/:id/follow — Follow/unfollow toggle
async function toggleFollow(req, res) {
    try {
        const targetUserId = req.params.id;
        const currentUserId = req.user._id.toString();

        if (targetUserId === currentUserId) {
            return res.status(400).json({ message: "You cannot follow yourself" });
        }

        const targetUser = await userModel.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const currentUser = await userModel.findById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({ message: "Authenticated user not found" });
        }

        // Strict string-based ObjectId check to avoid reference mismatch
        const isFollowing = (targetUser.followers || []).some(id => id.toString() === currentUserId);
        const isRequested = (targetUser.followRequests || []).some(id => id.toString() === currentUserId);
        const isFollower = (targetUser.following || []).some(id => id.toString() === currentUserId);

        const io = req.app.get("io");
        const { sendPushNotificationToUser } = require("../utils/pushNotifications");

        if (isFollowing) {
            // ── UNFOLLOW FLOW ───────────────────────────────────────────────
            await Promise.all([
                userModel.findByIdAndUpdate(targetUserId, { $pull: { followers: currentUserId } }),
                userModel.findByIdAndUpdate(currentUserId, { $pull: { following: targetUserId } }),
                // Remove existing follow notification to keep notification inbox pristine
                notificationModel.deleteMany({
                    recipient: targetUserId,
                    sender: currentUserId,
                    type: { $in: ["follow", "follow_request"] }
                })
            ]);

            // Invalidate Redis/In-Memory caches for both users
            await invalidateUserCache(targetUserId, currentUserId);

            // Fetch latest counts from DB
            const [freshTarget, freshCurrent] = await Promise.all([
                userModel.findById(targetUserId).select("followers following"),
                userModel.findById(currentUserId).select("followers following")
            ]);

            const targetFollowersCount = (freshTarget?.followers || []).length;
            const targetFollowingCount = (freshTarget?.following || []).length;
            const currentFollowersCount = (freshCurrent?.followers || []).length;
            const currentFollowingCount = (freshCurrent?.following || []).length;

            // Emit real-time socket events for instantaneous cross-device sync
            if (io) {
                io.to(String(targetUserId)).emit("follow-updated", {
                    actorId: currentUserId,
                    targetUserId: targetUserId,
                    isFollowing: false,
                    isRequested: false,
                    isMutualFollow: false,
                    followersCount: targetFollowersCount,
                    followingCount: targetFollowingCount
                });
                io.to(String(currentUserId)).emit("follow-updated", {
                    actorId: currentUserId,
                    targetUserId: targetUserId,
                    isFollowing: false,
                    isRequested: false,
                    isMutualFollow: false,
                    followersCount: currentFollowersCount,
                    followingCount: currentFollowingCount
                });
            }

            return res.status(200).json({
                success: true,
                message: "Unfollowed successfully",
                isFollowing: false,
                isRequested: false,
                isMutualFollow: false,
                followersCount: targetFollowersCount,
                followingCount: targetFollowingCount,
                targetUser: {
                    _id: targetUserId,
                    followersCount: targetFollowersCount,
                    followingCount: targetFollowingCount
                },
                currentUser: {
                    _id: currentUserId,
                    followersCount: currentFollowersCount,
                    followingCount: currentFollowingCount
                }
            });
        } else if (targetUser.isPrivate) {
            // ── PRIVATE ACCOUNT FLOW ────────────────────────────────────────
            if (isRequested) {
                // Cancel pending follow request
                await Promise.all([
                    userModel.findByIdAndUpdate(targetUserId, { $pull: { followRequests: currentUserId } }),
                    userModel.findByIdAndUpdate(currentUserId, { $pull: { sentFollowRequests: targetUserId } }),
                    notificationModel.deleteMany({
                        recipient: targetUserId,
                        sender: currentUserId,
                        type: "follow_request"
                    })
                ]);

                await invalidateUserCache(targetUserId, currentUserId);

                const freshTarget = await userModel.findById(targetUserId).select("followers following");
                const targetFollowersCount = (freshTarget?.followers || []).length;
                const targetFollowingCount = (freshTarget?.following || []).length;

                return res.status(200).json({
                    success: true,
                    message: "Follow request cancelled",
                    isFollowing: false,
                    isRequested: false,
                    isMutualFollow: false,
                    followersCount: targetFollowersCount,
                    followingCount: targetFollowingCount
                });
            } else {
                // Send follow request
                await Promise.all([
                    userModel.findByIdAndUpdate(targetUserId, { $addToSet: { followRequests: currentUserId } }),
                    userModel.findByIdAndUpdate(currentUserId, { $addToSet: { sentFollowRequests: targetUserId } })
                ]);

                await invalidateUserCache(targetUserId, currentUserId);

                // Create follow request notification
                const notif = await notificationModel.create({
                    recipient: targetUserId,
                    sender: currentUserId,
                    type: "follow_request",
                    message: `${req.user.username} requested to follow you`
                });

                if (io) {
                    const populatedNotif = await notificationModel.findById(notif._id)
                        .populate("sender", "username fullName avatar isVerified");
                    io.to(String(targetUserId)).emit("new-notification", populatedNotif);
                }

                sendPushNotificationToUser(
                    targetUserId,
                    "Follow Request",
                    `@${req.user.username} requested to follow you`,
                    { type: "follow_request", userId: currentUserId }
                );

                const freshTarget = await userModel.findById(targetUserId).select("followers following");
                const targetFollowersCount = (freshTarget?.followers || []).length;
                const targetFollowingCount = (freshTarget?.following || []).length;

                return res.status(200).json({
                    success: true,
                    message: "Follow requested",
                    isFollowing: false,
                    isRequested: true,
                    isMutualFollow: false,
                    followersCount: targetFollowersCount,
                    followingCount: targetFollowingCount
                });
            }
        } else {
            // ── PUBLIC ACCOUNT FOLLOW FLOW ──────────────────────────────────
            await Promise.all([
                userModel.findByIdAndUpdate(targetUserId, { $addToSet: { followers: currentUserId } }),
                userModel.findByIdAndUpdate(currentUserId, { $addToSet: { following: targetUserId } })
            ]);

            await invalidateUserCache(targetUserId, currentUserId);

            // Clean up old notifications and create fresh follow notification
            await notificationModel.deleteMany({
                recipient: targetUserId,
                sender: currentUserId,
                type: "follow"
            });

            const notif = await notificationModel.create({
                recipient: targetUserId,
                sender: currentUserId,
                type: "follow",
                message: `${req.user.username} started following you`
            });

            const [freshTarget, freshCurrent] = await Promise.all([
                userModel.findById(targetUserId).select("followers following"),
                userModel.findById(currentUserId).select("followers following")
            ]);

            const targetFollowersCount = (freshTarget?.followers || []).length;
            const targetFollowingCount = (freshTarget?.following || []).length;
            const currentFollowersCount = (freshCurrent?.followers || []).length;
            const currentFollowingCount = (freshCurrent?.following || []).length;
            const isMutualFollow = isFollower;

            if (io) {
                const populatedNotif = await notificationModel.findById(notif._id)
                    .populate("sender", "username fullName avatar isVerified");
                
                io.to(String(targetUserId)).emit("new-notification", populatedNotif);
                
                io.to(String(targetUserId)).emit("follow-updated", {
                    actorId: currentUserId,
                    targetUserId: targetUserId,
                    isFollowing: true,
                    isRequested: false,
                    isMutualFollow,
                    followersCount: targetFollowersCount,
                    followingCount: targetFollowingCount
                });

                io.to(String(currentUserId)).emit("follow-updated", {
                    actorId: currentUserId,
                    targetUserId: targetUserId,
                    isFollowing: true,
                    isRequested: false,
                    isMutualFollow,
                    followersCount: currentFollowersCount,
                    followingCount: currentFollowingCount
                });
            }

            sendPushNotificationToUser(
                targetUserId,
                "New Follower",
                `@${req.user.username} started following you`,
                { type: "follow", userId: currentUserId }
            );

            return res.status(200).json({
                success: true,
                message: "Followed successfully",
                isFollowing: true,
                isRequested: false,
                isMutualFollow,
                followersCount: targetFollowersCount,
                followingCount: targetFollowingCount,
                targetUser: {
                    _id: targetUserId,
                    followersCount: targetFollowersCount,
                    followingCount: targetFollowingCount
                },
                currentUser: {
                    _id: currentUserId,
                    followersCount: currentFollowersCount,
                    followingCount: currentFollowingCount
                }
            });
        }
    } catch (error) {
        console.error("toggleFollow error:", error);
        res.status(500).json({ message: error.message });
    }
}

// POST /api/users/:id/follow-request/accept — Accept follow request
async function acceptFollowRequest(req, res) {
    try {
        const requesterId = req.params.id; // The user who sent the follow request
        const currentUserId = req.user._id.toString(); // The recipient user accepting the request

        const currentUser = await userModel.findById(currentUserId);
        const requester = await userModel.findById(requesterId);

        if (!currentUser || !requester) {
            return res.status(404).json({ message: "User not found" });
        }

        // Pull from request queues, add to followers/following
        await Promise.all([
            userModel.findByIdAndUpdate(currentUserId, {
                $pull: { followRequests: requesterId },
                $addToSet: { followers: requesterId }
            }),
            userModel.findByIdAndUpdate(requesterId, {
                $pull: { sentFollowRequests: currentUserId },
                $addToSet: { following: currentUserId }
            }),
            // Mark follow_request notification as accepted / remove it
            notificationModel.deleteMany({
                recipient: currentUserId,
                sender: requesterId,
                type: "follow_request"
            })
        ]);

        await invalidateUserCache(currentUserId, requesterId);

        // Notify requester that their follow request was accepted
        const notif = await notificationModel.create({
            recipient: requesterId,
            sender: currentUserId,
            type: "follow",
            message: `${req.user.username} accepted your follow request`
        });

        const io = req.app.get("io");
        if (io) {
            const populatedNotif = await notificationModel.findById(notif._id)
                .populate("sender", "username fullName avatar isVerified");
            io.to(String(requesterId)).emit("new-notification", populatedNotif);

            io.to(String(requesterId)).emit("follow-updated", {
                actorId: currentUserId,
                targetUserId: currentUserId,
                isFollowing: true,
                isRequested: false
            });
        }

        const { sendPushNotificationToUser } = require("../utils/pushNotifications");
        sendPushNotificationToUser(
            requesterId,
            "Follow Request Accepted",
            `@${req.user.username} accepted your follow request`,
            { type: "follow_accepted", userId: currentUserId }
        );

        const freshCurrent = await userModel.findById(currentUserId).select("followers following");

        res.status(200).json({
            success: true,
            message: "Follow request accepted",
            followersCount: (freshCurrent?.followers || []).length,
            followingCount: (freshCurrent?.following || []).length
        });
    } catch (error) {
        console.error("acceptFollowRequest error:", error);
        res.status(500).json({ message: error.message });
    }
}

// POST /api/users/:id/follow-request/decline — Decline follow request
async function declineFollowRequest(req, res) {
    try {
        const requesterId = req.params.id;
        const currentUserId = req.user._id.toString();

        await Promise.all([
            userModel.findByIdAndUpdate(currentUserId, { $pull: { followRequests: requesterId } }),
            userModel.findByIdAndUpdate(requesterId, { $pull: { sentFollowRequests: currentUserId } }),
            notificationModel.deleteMany({
                recipient: currentUserId,
                sender: requesterId,
                type: "follow_request"
            })
        ]);

        await invalidateUserCache(currentUserId, requesterId);

        res.status(200).json({ success: true, message: "Follow request declined" });
    } catch (error) {
        console.error("declineFollowRequest error:", error);
        res.status(500).json({ message: error.message });
    }
}

// GET /api/users/:id/followers — Rich Instagram-grade Followers Directory
async function getFollowers(req, res) {
    try {
        const targetUserId = req.params.id;
        const currentUserId = req.user._id.toString();

        const targetUser = await userModel.findById(targetUserId)
            .select("username isPrivate followers following")
            .lean();

        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const isOwner = targetUser._id.toString() === currentUserId;
        const isFollowing = (targetUser.followers || []).some(id => id.toString() === currentUserId);

        if (targetUser.isPrivate && !isOwner && !isFollowing) {
            return res.status(403).json({ message: "This follow list is private" });
        }

        const followerIds = targetUser.followers || [];
        const query = (req.query.q || "").trim();
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        let matchFilter = { _id: { $in: followerIds }, isSoftDeleted: { $ne: true }, isBanned: { $ne: true } };

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            matchFilter.$or = [
                { username: searchRegex },
                { fullName: searchRegex },
                { collegeName: searchRegex }
            ];
        }

        const [totalCount, rawFollowers, currentUser] = await Promise.all([
            userModel.countDocuments(matchFilter),
            userModel.find(matchFilter)
                .select("username fullName avatar isVerified isPrivate collegeName followers following followRequests")
                .skip(skip)
                .limit(limit)
                .lean(),
            userModel.findById(currentUserId).select("following followers sentFollowRequests").lean()
        ]);

        const currentUserFollowingSet = new Set((currentUser?.following || []).map(id => id.toString()));
        const currentUserFollowersSet = new Set((currentUser?.followers || []).map(id => id.toString()));
        const currentUserSentRequestsSet = new Set((currentUser?.sentFollowRequests || []).map(id => id.toString()));

        const enrichedFollowers = rawFollowers.map(u => {
            const uId = u._id.toString();
            const isSelf = uId === currentUserId;
            const viewerFollowsUser = currentUserFollowingSet.has(uId);
            const userFollowsViewer = currentUserFollowersSet.has(uId);
            const isPendingRequest = currentUserSentRequestsSet.has(uId);

            return {
                _id: u._id,
                username: u.username,
                fullName: u.fullName || "",
                avatar: u.avatar || "",
                collegeName: u.collegeName || "",
                isVerified: !!u.isVerified,
                isPrivate: !!u.isPrivate,
                followersCount: (u.followers || []).length,
                followingCount: (u.following || []).length,
                _isSelf: isSelf,
                _isFollowing: viewerFollowsUser,
                _isFollower: userFollowsViewer,
                _isRequested: isPendingRequest,
                _canFollowBack: userFollowsViewer && !viewerFollowsUser && !isSelf
            };
        });

        res.status(200).json({
            success: true,
            followers: enrichedFollowers,
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasMore: skip + rawFollowers.length < totalCount
        });
    } catch (error) {
        console.error("getFollowers error:", error);
        res.status(500).json({ message: error.message });
    }
}

// GET /api/users/:id/following — Rich Instagram-grade Following Directory
async function getFollowing(req, res) {
    try {
        const targetUserId = req.params.id;
        const currentUserId = req.user._id.toString();

        const targetUser = await userModel.findById(targetUserId)
            .select("username isPrivate followers following")
            .lean();

        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const isOwner = targetUser._id.toString() === currentUserId;
        const isFollowing = (targetUser.followers || []).some(id => id.toString() === currentUserId);

        if (targetUser.isPrivate && !isOwner && !isFollowing) {
            return res.status(403).json({ message: "This follow list is private" });
        }

        const followingIds = targetUser.following || [];
        const query = (req.query.q || "").trim();
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        let matchFilter = { _id: { $in: followingIds }, isSoftDeleted: { $ne: true }, isBanned: { $ne: true } };

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            matchFilter.$or = [
                { username: searchRegex },
                { fullName: searchRegex },
                { collegeName: searchRegex }
            ];
        }

        const [totalCount, rawFollowing, currentUser] = await Promise.all([
            userModel.countDocuments(matchFilter),
            userModel.find(matchFilter)
                .select("username fullName avatar isVerified isPrivate collegeName followers following followRequests")
                .skip(skip)
                .limit(limit)
                .lean(),
            userModel.findById(currentUserId).select("following followers sentFollowRequests").lean()
        ]);

        const currentUserFollowingSet = new Set((currentUser?.following || []).map(id => id.toString()));
        const currentUserFollowersSet = new Set((currentUser?.followers || []).map(id => id.toString()));
        const currentUserSentRequestsSet = new Set((currentUser?.sentFollowRequests || []).map(id => id.toString()));

        const enrichedFollowing = rawFollowing.map(u => {
            const uId = u._id.toString();
            const isSelf = uId === currentUserId;
            const viewerFollowsUser = currentUserFollowingSet.has(uId);
            const userFollowsViewer = currentUserFollowersSet.has(uId);
            const isPendingRequest = currentUserSentRequestsSet.has(uId);

            return {
                _id: u._id,
                username: u.username,
                fullName: u.fullName || "",
                avatar: u.avatar || "",
                collegeName: u.collegeName || "",
                isVerified: !!u.isVerified,
                isPrivate: !!u.isPrivate,
                followersCount: (u.followers || []).length,
                followingCount: (u.following || []).length,
                _isSelf: isSelf,
                _isFollowing: viewerFollowsUser,
                _isFollower: userFollowsViewer,
                _isRequested: isPendingRequest,
                _canFollowBack: userFollowsViewer && !viewerFollowsUser && !isSelf
            };
        });

        res.status(200).json({
            success: true,
            following: enrichedFollowing,
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasMore: skip + rawFollowing.length < totalCount
        });
    } catch (error) {
        console.error("getFollowing error:", error);
        res.status(500).json({ message: error.message });
    }
}

// GET /api/users/search?q=
async function searchUsers(req, res) {
    try {
        const query = req.query.q;
        if (!query || typeof query !== "string") {
            return res.status(200).json({ users: [] });
        }

        const normalizedQuery = query.trim().toLowerCase();
        if (normalizedQuery.length < 2) {
            return res.status(200).json({ users: [] });
        }

        // 1. Fetch current user following to rank friends higher
        const currentUser = await userModel.findById(req.user._id).select("following").lean();
        const followingSet = new Set(currentUser?.following ? currentUser.following.map(id => id.toString()) : []);

        // 2. Fetch candidates using optimized index-friendly query conditions (no wildcard prefix scans)
        const isUsernameQuery = normalizedQuery.startsWith('@');
        const searchTerm = isUsernameQuery ? normalizedQuery.substring(1) : normalizedQuery;

        const orConditions = [];
        if (isUsernameQuery) {
            // Anchor search using ^ (uses unique username index)
            orConditions.push({ username: { $regex: new RegExp(`^${searchTerm}`, "i") } });
        } else {
            // Anchor search on username and fullName (uses index)
            orConditions.push({ username: { $regex: new RegExp(`^${searchTerm}`, "i") } });
            orConditions.push({ fullName: { $regex: new RegExp(`^${searchTerm}`, "i") } });
            
            // Text search fallback (uses native MongoDB text index on username & fullName)
            orConditions.push({ $text: { $search: searchTerm } });
        }

        const candidates = await userModel.find({
            _id: { $ne: req.user._id },
            isBanned: false,
            isSoftDeleted: false,
            $or: orConditions
        })
        .select("username fullName avatar bio collegeName isVerified followers lastActive")
        .limit(100) // Query up to 100 candidates for dynamic scoring
        .lean();

        // Levenshtein function for typo tolerance
        const getLevenshteinDistance = (s1, s2) => {
            const len1 = s1.length;
            const len2 = s2.length;
            if (len1 === 0) return len2;
            if (len2 === 0) return len1;
            
            const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
            for (let i = 0; i <= len1; i++) matrix[0][i] = i;
            for (let j = 0; j <= len2; j++) matrix[j][0] = j;
            
            for (let j = 1; j <= len2; j++) {
                for (let i = 1; i <= len1; i++) {
                    const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                    matrix[j][i] = Math.min(
                        matrix[j][i - 1] + 1, // insertion
                        matrix[j - 1][i] + 1, // deletion
                        matrix[j - 1][i - 1] + cost // substitution
                    );
                }
            }
            return matrix[len2][len1];
        };

        // 3. Compute Instagram/Twitter weighted score for each candidate
        const scoredCandidates = candidates.map(user => {
            let score = 0;
            const uName = user.username.toLowerCase();
            const fName = (user.fullName || "").toLowerCase();
            const collName = (user.collegeName || "").toLowerCase();
            const bioText = (user.bio || "").toLowerCase();

            // A. Username Match Metrics
            if (uName === normalizedQuery) {
                score += 15000; // Exact match gets absolute priority
            } else if (uName.startsWith(normalizedQuery)) {
                score += 8000; // StartsWith gets premium priority
            } else if (uName.includes(normalizedQuery)) {
                score += 4000; // Substring match
            }

            // B. Full Name Match Metrics
            if (fName === normalizedQuery) {
                score += 6000;
            } else if (fName.startsWith(normalizedQuery)) {
                score += 4000;
            } else if (fName.includes(normalizedQuery)) {
                score += 2000;
            }

            // C. College Name / Bio Matches
            if (collName.includes(normalizedQuery)) {
                score += 1000;
            }
            if (bioText.includes(normalizedQuery)) {
                score += 500;
            }

            // D. Typo Tolerance / Fuzzy Matching via Levenshtein Distance (Min 3 characters)
            if (normalizedQuery.length >= 3) {
                const distance = getLevenshteinDistance(normalizedQuery, uName);
                if (distance <= 2) {
                    score += (3 - distance) * 2000; // Less distance = higher score
                }
                
                // Check name words
                const nameWords = fName.split(/\s+/).filter(Boolean);
                nameWords.forEach(word => {
                    const wordDistance = getLevenshteinDistance(normalizedQuery, word);
                    if (wordDistance <= 1) {
                        score += (2 - wordDistance) * 1000;
                    }
                });
            }

            // E. Trust/Authority Indicators
            if (user.isVerified) {
                score += 3000; // Verified account bonus
            }

            // F. Social graph relations (Following status & mutual status)
            const isFollowingUser = followingSet.has(user._id.toString());
            if (isFollowingUser) {
                score += 4000; // Pre-existing relationship
            }
            const userFollowers = user.followers ? user.followers.map(id => id.toString()) : [];
            const isFollowingMeBack = userFollowers.includes(req.user._id.toString());
            if (isFollowingMeBack) {
                score += 2000;
            }
            if (isFollowingUser && isFollowingMeBack) {
                score += 3000; // Mutual friends bonus!
            }

            // G. Activity metrics
            if (user.lastActive) {
                const hoursSinceActive = (Date.now() - new Date(user.lastActive).getTime()) / 3600000;
                if (hoursSinceActive <= 24) {
                    score += 1000; // Active within 24 hours
                } else if (hoursSinceActive <= 168) {
                    score += 500; // Active within 7 days
                }
            }

            return { user, score };
        });

        // 4. Sort based on highest score and slice to top 10 results for suggestions
        const sortedUsers = scoredCandidates
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.user)
            .slice(0, 15);

        res.status(200).json({ users: sortedUsers });
    } catch (error) {
        console.error("Search users error:", error);
        res.status(500).json({ message: error.message });
    }
}

// GET /api/users/suggestions — Suggested users to follow
async function getSuggestions(req, res) {
    try {
        const currentUser = await userModel.findById(req.user._id);

        const baseFilter = {
            _id: { $nin: [...(currentUser.following || []), currentUser._id] },
            isBanned: false,
            isSoftDeleted: false
        };

        let sameCollegeSuggestions = [];
        if (currentUser.collegeName) {
            sameCollegeSuggestions = await userModel.find({ ...baseFilter, collegeName: currentUser.collegeName })
                .select("username fullName avatar followers isPrivate collegeName")
                .limit(10)
                .lean();
        }

        const sameCollegeIds = sameCollegeSuggestions.map(u => u._id);
        
        let genericSuggestions = [];
        if (sameCollegeSuggestions.length < 15) {
            genericSuggestions = await userModel.find({
                ...baseFilter,
                _id: { $nin: [...(currentUser.following || []), currentUser._id, ...sameCollegeIds] }
            })
            .select("username fullName avatar followers isPrivate collegeName")
            .limit(15 - sameCollegeSuggestions.length)
            .sort({ createdAt: -1 })
            .lean();
        }

        const suggestions = [...sameCollegeSuggestions, ...genericSuggestions];

        // Add follower count for sorting, prioritize college match
        const sorted = suggestions
            .map(u => ({ 
                ...u, 
                followersCount: u.followers?.length || 0,
                isCollegeMatch: u.collegeName && u.collegeName === currentUser.collegeName
            }))
            .sort((a, b) => {
                if (a.isCollegeMatch && !b.isCollegeMatch) return -1;
                if (!a.isCollegeMatch && b.isCollegeMatch) return 1;
                return b.followersCount - a.followersCount;
            });

        res.status(200).json({ users: sorted });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/users/request-soft-delete
async function requestSoftDelete(req, res) {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ message: "Password is required to delete account" });

        const user = await userModel.findById(req.user._id);
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

        user.isSoftDeleted = true;
        user.deletedAt = new Date();
        user.scheduledDeletionAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days
        user.deletedByUser = true;
        await user.save();

        res.status(200).json({ message: "Account scheduled for deletion. You will be logged out." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/users/recover-account
async function recoverAccount(req, res) {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: "Username and password are required" });

        const user = await userModel.findOne({ username, isSoftDeleted: true });
        
        if (!user) return res.status(404).json({ message: "Account not found or not scheduled for deletion" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

        user.isSoftDeleted = false;
        user.deletedAt = null;
        user.scheduledDeletionAt = null;
        user.deletedByUser = false;
        await user.save();

        res.status(200).json({ message: "Account recovered successfully! You can now login." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// DELETE /api/users/delete-account
async function hardDeleteAccount(req, res) {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ message: "Password is required to delete account" });

        const user = await userModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

        const userId = user._id;

        // --- 1. Delete Messages and DMs ---
        // Find all DM conversations where user is a participant
        const dms = await Conversation.find({ type: "dm", participants: userId });
        const dmIds = dms.map(c => c._id);
        
        // Delete all messages in those DMs
        await Message.deleteMany({ conversation: { $in: dmIds } });
        // Delete the DM conversations
        await Conversation.deleteMany({ _id: { $in: dmIds } });

        // For Groups: Remove user from participants
        await Conversation.updateMany(
            { type: "group", participants: userId },
            { $pull: { participants: userId } }
        );

        // --- 2. Delete Content ---
        await Confession.deleteMany({ user: userId });
        await Comment.deleteMany({ user: userId });

        // --- 3. Delete Notifications ---
        await notificationModel.deleteMany({
            $or: [{ sender: userId }, { recipient: userId }]
        });

        // --- 4. Delete Dating Data ---
        await DatingProfile.deleteOne({ user: userId });
        await DatingProfile.updateMany(
            { $or: [{ likedUsers: userId }, { passedUsers: userId }, { matches: userId }] },
            { 
                $pull: { likedUsers: userId, passedUsers: userId, matches: userId } 
            }
        );
        await Swipe.deleteMany({
            $or: [{ swiper: userId }, { swipedUser: userId }]
        });

        // --- 5. Remove from Social Graph ---
        await userModel.updateMany(
            { $or: [{ followers: userId }, { following: userId }] },
            { 
                $pull: { followers: userId, following: userId } 
            }
        );

        // --- 6. Delete User Record ---
        await user.deleteOne();

        res.status(200).json({ message: "Account completely deleted successfully." });
    } catch (error) {
        console.error("Hard delete error:", error);
        res.status(500).json({ message: error.message });
    }
}

// POST /api/users/:id/follow-request/accept
async function acceptFollowRequest(req, res) {
    try {
        const requesterId = req.params.id;
        const currentUserId = req.user._id;

        const currentUser = await userModel.findById(currentUserId);
        if (!currentUser.followRequests.some(id => id.toString() === requesterId.toString())) {
            // Return 200 even if not found, so the frontend removes the stale notification
            return res.status(200).json({ message: "Follow request already handled or cancelled" });
        }

        // Accept request: Add to followers, remove from requests
        await userModel.findByIdAndUpdate(currentUserId, {
            $pull: { followRequests: requesterId },
            $addToSet: { followers: requesterId }
        });
        await userModel.findByIdAndUpdate(requesterId, {
            $pull: { sentFollowRequests: currentUserId },
            $addToSet: { following: currentUserId }
        });

        // Delete follow request notification
        await notificationModel.deleteOne({
            recipient: currentUserId,
            sender: requesterId,
            type: "follow_request"
        });

        // Create notification
        const notif = await notificationModel.create({
            recipient: requesterId,
            sender: currentUserId,
            type: "follow",
            message: `${req.user.username} accepted your follow request`
        });

        // Emit socket
        const io = req.app.get("io");
        if (io) {
            const populatedNotif = await notificationModel.findById(notif._id)
                .populate("sender", "username fullName avatar");
            io.to(String(requesterId)).emit("new-notification", populatedNotif);
        }

        // Send push notification
        const { sendPushNotificationToUser } = require("../utils/pushNotifications");
        sendPushNotificationToUser(
            requesterId,
            "Follow Request Accepted",
            `${req.user.username} accepted your follow request`,
            { type: "follow", userId: currentUserId.toString() }
        );

        res.status(200).json({ message: "Follow request accepted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/users/:id/follow-request/decline
async function declineFollowRequest(req, res) {
    try {
        const requesterId = req.params.id;
        const currentUserId = req.user._id;

        const currentUser = await userModel.findById(currentUserId);
        if (!currentUser.followRequests.some(id => id.toString() === requesterId.toString())) {
            return res.status(200).json({ message: "Request already handled" });
        }

        await userModel.findByIdAndUpdate(currentUserId, {
            $pull: { followRequests: requesterId }
        });
        await userModel.findByIdAndUpdate(requesterId, {
            $pull: { sentFollowRequests: currentUserId }
        });

        // Delete follow request notification
        await notificationModel.deleteOne({
            recipient: currentUserId,
            sender: requesterId,
            type: "follow_request"
        });

        res.status(200).json({ message: "Follow request declined" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function savePushToken(req, res) {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ message: "Push token is required" });
        }
        if (typeof token !== "string" || (!token.startsWith("ExponentPushToken") && !token.startsWith("ExpoPushToken"))) {
            return res.status(400).json({ message: "Invalid push token format" });
        }

        await userModel.findByIdAndUpdate(req.user._id, {
            $addToSet: { pushTokens: token }
        });

        res.status(200).json({ message: "Push token registered successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// PUT /api/users/avatar — Update profile avatar with automatic old image deletion
async function updateAvatar(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No avatar image provided" });
        }
        const { uploadAvatar, deleteImage } = require("../utils/cloudinary");
        const sharp = require("sharp");

        let processedBuffer = req.file.buffer;
        try {
            processedBuffer = await sharp(req.file.buffer)
                .resize({ width: 400, height: 400, fit: 'cover' })
                .jpeg({ quality: 85, progressive: true })
                .toBuffer();
        } catch (sharpErr) {
            console.warn("Sharp avatar compression skipped:", sharpErr.message);
        }

        const avatarUrl = await uploadAvatar(processedBuffer, "image/jpeg");

        const user = await userModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Delete old avatar from Cloudinary if different
        const oldAvatar = user.avatar;
        if (oldAvatar && oldAvatar !== avatarUrl && oldAvatar.includes("cloudinary.com")) {
            deleteImage(oldAvatar).catch((e) => console.warn("Failed to delete old avatar:", e.message));
        }

        user.avatar = avatarUrl;
        if (Array.isArray(user.photos) && user.photos.length > 0) {
            user.photos[0] = avatarUrl;
        } else {
            user.photos = [avatarUrl];
        }
        await user.save();

        const { invalidateUserCache } = require("../middlewares/cacheMiddleware");
        invalidateUserCache(req.user._id);

        res.status(200).json({
            message: "Avatar updated successfully",
            avatar: avatarUrl,
            photos: user.photos,
            user
        });
    } catch (err) {
        console.error("updateAvatar error:", err);
        res.status(500).json({ message: err.message });
    }
}

// PUT /api/users/cover — Update cover photo with automatic old image deletion
async function updateCover(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No image provided" });
        }
        const { uploadImage, deleteImage } = require("../utils/cloudinary");
        const sharp = require("sharp");

        // High-speed Sharp buffer compression for mobile performance
        let processedBuffer = req.file.buffer;
        try {
            processedBuffer = await sharp(req.file.buffer)
                .resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80, progressive: true })
                .toBuffer();
        } catch (sharpErr) {
            console.warn("Sharp cover compression skipped:", sharpErr.message);
        }

        const coverPhotoUrl = await uploadImage(processedBuffer, {
            folder: "hykee/covers",
            quality: "auto:good",
            fetch_format: "auto"
        }, "image/jpeg");

        const oldUser = await userModel.findById(req.user._id).select("coverPhoto");
        const oldCover = oldUser?.coverPhoto;

        const user = await userModel.findByIdAndUpdate(
            req.user._id,
            { coverPhoto: coverPhotoUrl },
            { returnDocument: 'after' }
        ).select("coverPhoto");

        // Automatically delete previous cover photo from Cloudinary
        if (oldCover && oldCover !== coverPhotoUrl && oldCover.includes("cloudinary.com")) {
            deleteImage(oldCover).catch((e) => console.warn("Failed to delete old cover:", e.message));
        }

        const { invalidateUserCache } = require("../middlewares/cacheMiddleware");
        invalidateUserCache(req.user._id);

        res.status(200).json({ message: "Cover photo updated successfully", coverPhoto: coverPhotoUrl, user });
    } catch (err) {
        console.error("updateCover error:", err);
        res.status(500).json({ message: err.message });
    }
}

// PUT /api/users/resume — Upload resume PDF
async function uploadResume(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file provided" });
        }
        const { uploadImage } = require("../utils/cloudinary");
        const mimetype = req.file.mimetype || "";
        const resumeUrl = await uploadImage(req.file.buffer, {
            folder: "hykee/resumes",
            resource_type: "raw"
        }, mimetype);

        const user = await userModel.findByIdAndUpdate(
            req.user._id,
            { resume: resumeUrl },
            { returnDocument: 'after' }
        ).select("resume");

        res.status(200).json({ message: "Resume updated successfully", resume: resumeUrl, user });
    } catch (err) {
        console.error("uploadResume error:", err);
        res.status(500).json({ message: err.message });
    }
}

// ─── User Photo Gallery CRUD ───────────────────────────────────────────────────
async function uploadUserPhoto(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No image provided" });
        }

        const user = await userModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.photos.length >= 6) {
            return res.status(400).json({ message: "Maximum 6 photos allowed" });
        }

        const { uploadImage } = require("../utils/cloudinary");
        const mimetype = req.file.mimetype || "";
        const photoUrl = await uploadImage(req.file.buffer, {
            folder: "hykee/user-gallery",
            transformation: [{ width: 800, height: 800, crop: "fill", gravity: "auto" }]
        }, mimetype);

        user.photos.push(photoUrl);
        if (user.photos.length === 1 || !user.avatar) {
            user.avatar = photoUrl;
        }
        await user.save();

        const { invalidateUserCache } = require("../middlewares/cacheMiddleware");
        invalidateUserCache(req.user._id);

        res.status(200).json({ message: "Photo uploaded successfully", photoUrl, photos: user.photos, avatar: user.avatar });
    } catch (err) {
        console.error("uploadUserPhoto error:", err);
        res.status(500).json({ message: err.message });
    }
}

async function deleteUserPhoto(req, res) {
    try {
        const { photoUrl } = req.body;
        if (!photoUrl) {
            return res.status(400).json({ message: "Photo URL is required" });
        }

        const user = await userModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.photos.length <= 1) {
            return res.status(400).json({ message: "At least one profile photo is required." });
        }

        const { deleteImage } = require("../utils/cloudinary");
        if (photoUrl.includes("cloudinary.com")) {
            await deleteImage(photoUrl).catch((e) => console.warn("Failed to delete Cloudinary photo:", e.message));
        }

        user.photos = user.photos.filter(p => p !== photoUrl);

        if (user.avatar === photoUrl) {
            user.avatar = user.photos[0] || "";
        }
        await user.save();

        const { invalidateUserCache } = require("../middlewares/cacheMiddleware");
        invalidateUserCache(req.user._id);

        res.status(200).json({ message: "Photo deleted successfully", photos: user.photos, avatar: user.avatar });
    } catch (err) {
        console.error("deleteUserPhoto error:", err);
        res.status(500).json({ message: err.message });
    }
}

async function reorderUserPhotos(req, res) {
    try {
        const { photos } = req.body;
        if (!Array.isArray(photos) || photos.length === 0) {
            return res.status(400).json({ message: "Photos list is required" });
        }

        const user = await userModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const allValid = photos.every(p => user.photos.includes(p));
        if (!allValid) {
            return res.status(400).json({ message: "Invalid photos provided in list" });
        }

        user.photos = photos;
        user.avatar = photos[0] || "";
        await user.save();

        const { invalidateUserCache } = require("../middlewares/cacheMiddleware");
        invalidateUserCache(req.user._id);

        res.status(200).json({ message: "Photos reordered successfully", photos: user.photos, avatar: user.avatar });
    } catch (err) {
        console.error("reorderUserPhotos error:", err);
        res.status(500).json({ message: err.message });
    }
}

module.exports = {
    getUserProfile,
    updateProfile,
    updateAvatar,
    updateCover,
    uploadResume,
    requestEmailVerification,
    verifyEmail,
    requestSoftDelete,
    hardDeleteAccount,
    recoverAccount,
    toggleFollow,
    getFollowers,
    getFollowing,
    searchUsers,
    getSuggestions,
    acceptFollowRequest,
    declineFollowRequest,
    savePushToken,
    uploadUserPhoto,
    deleteUserPhoto,
    reorderUserPhotos
};
