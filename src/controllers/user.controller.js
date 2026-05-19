const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");
const DatingProfile = require("../models/dating.model");
const notificationModel = require("../models/notification.model");
const { uploadAvatar } = require('../utils/cloudinary');
const crypto = require("crypto");
const { sendVerificationEmail } = require("../services/emailService");

// GET /api/users/:id — Get user profile
async function getUserProfile(req, res) {
    try {
        const user = await userModel.findById(req.params.id)
            .select("-password")
            .populate("followers", "username fullName avatar")
            .populate("following", "username fullName avatar");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const currentUserId = req.user._id.toString();
        const targetUserId = user._id.toString();
        const isOwner = currentUserId === targetUserId;
        const isFollowing = user.followers.some(f => f._id.toString() === currentUserId);

        let responseUser = user.toObject();

        if (responseUser.isPrivate && !isOwner && !isFollowing) {
            // Scrub private data
            responseUser.followers = [];
            responseUser.following = [];
            responseUser.bio = "";
            responseUser.isPrivateHidden = true; // Flag for frontend
            responseUser.datingPhotos = []; // Privacy: Unauthorized users see nothing
        } else {
            // Fetch dating photos
            // Logic: Owner sees photos even if not active. 
            // Others only see photos if dating is active.
            const query = { user: targetUserId };
            if (!isOwner) query.isDatingActive = true;
            
            const datingProfile = await DatingProfile.findOne(query);
            if (datingProfile) {
                // Use photoOrder if it exists, fallback to photos
                responseUser.datingPhotos = datingProfile.photoOrder && datingProfile.photoOrder.length > 0 
                    ? datingProfile.photoOrder 
                    : datingProfile.photos;
            } else {
                responseUser.datingPhotos = [];
            }
        }

        res.status(200).json({ user: responseUser });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// PUT /api/users/edit — Update own profile
async function updateProfile(req, res) {
    try {
        const { username, fullName, bio, avatar, isPrivate, email } = req.body;
        const user = await userModel.findById(req.user._id);

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
                isEmailVerified: user.isEmailVerified
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

        res.status(200).json({ message: "Email verified successfully!", isEmailVerified: true });
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
        ).select("-password");

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
        const currentUserId = req.user._id;

        if (targetUserId === currentUserId.toString()) {
            return res.status(400).json({ message: "You cannot follow yourself" });
        }

        const targetUser = await userModel.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const isFollowing = targetUser.followers.includes(currentUserId);

        if (isFollowing) {
            // Unfollow
            await userModel.findByIdAndUpdate(targetUserId, { $pull: { followers: currentUserId } });
            await userModel.findByIdAndUpdate(currentUserId, { $pull: { following: targetUserId } });
            res.status(200).json({ message: "Unfollowed successfully", isFollowing: false });
        } else {
            // Follow
            await userModel.findByIdAndUpdate(targetUserId, { $addToSet: { followers: currentUserId } });
            await userModel.findByIdAndUpdate(currentUserId, { $addToSet: { following: targetUserId } });

            // Create notification
            await notificationModel.create({
                recipient: targetUserId,
                sender: currentUserId,
                type: "follow",
                message: `${req.user.username} started following you`
            });

            res.status(200).json({ message: "Followed successfully", isFollowing: true });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// GET /api/users/:id/followers
async function getFollowers(req, res) {
    try {
        const user = await userModel.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isOwner = user._id.toString() === req.user._id.toString();
        const isFollowing = user.followers.includes(req.user._id);

        if (user.isPrivate && !isOwner && !isFollowing) {
            return res.status(403).json({ message: "This follow list is private" });
        }

        const query = req.query.q || "";
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const matchObj = { _id: { $in: user.followers || [] } };
        if (query) {
            // Use text search if available, fallback to regex for partials if needed
            // But for enterprise scale, text index is preferred
            matchObj.$text = { $search: query };
        }

        const followers = await userModel.find(matchObj)
            .select("username fullName avatar")
            .skip(skip)
            .limit(limit)
            .lean();

        // Optimized following check: use a single aggregation or a quick find
        const currentUser = await userModel.findById(req.user._id).select("following").lean();
        const followingSet = new Set((currentUser.following || []).map(id => id.toString()));

        const enrichedFollowers = followers.map(u => ({
            ...u,
            _isFollowing: followingSet.has(u._id.toString())
        }));

        res.status(200).json({ followers: enrichedFollowers, page, limit, hasMore: followers.length === limit });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// GET /api/users/:id/following
async function getFollowing(req, res) {
    try {
        const user = await userModel.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isOwner = user._id.toString() === req.user._id.toString();
        const isFollowing = user.followers.includes(req.user._id);

        if (user.isPrivate && !isOwner && !isFollowing) {
            return res.status(403).json({ message: "This follow list is private" });
        }

        const query = req.query.q || "";
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const matchObj = { _id: { $in: user.following || [] } };
        if (query) {
            matchObj.$text = { $search: query };
        }

        const followingList = await userModel.find(matchObj)
            .select("username fullName avatar")
            .skip(skip)
            .limit(limit)
            .lean();

        const currentUser = await userModel.findById(req.user._id).select("following").lean();
        const followingSet = new Set((currentUser.following || []).map(id => id.toString()));

        const enrichedFollowing = followingList.map(u => ({
            ...u,
            _isFollowing: followingSet.has(u._id.toString())
        }));

        res.status(200).json({ following: enrichedFollowing, page, limit, hasMore: followingList.length === limit });
    } catch (error) {
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

        // 2. Fetch candidates from MongoDB using optimized regex on indexed fields (username, fullName, collegeName, bio)
        const regexQuery = new RegExp(normalizedQuery, "i");
        const orConditions = [
            { username: { $regex: regexQuery } },
            { fullName: { $regex: regexQuery } },
            { collegeName: { $regex: regexQuery } },
            { bio: { $regex: regexQuery } }
        ];

        // Also add fuzzy candidates by prefix if query is long enough for typo tolerance
        if (normalizedQuery.length >= 3) {
            const prefix = normalizedQuery.slice(0, 2);
            orConditions.push({ username: { $regex: new RegExp(`^${prefix}`, "i") } });
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

        const suggestions = await userModel.find({
            _id: { $nin: [...currentUser.following, currentUser._id] },
            isBanned: false
        })
            .select("username fullName avatar followers")
            .limit(10)
            .sort({ createdAt: -1 });

        // Add follower count for sorting
        const sorted = suggestions
            .map(u => ({ ...u.toObject(), followersCount: u.followers.length }))
            .sort((a, b) => b.followersCount - a.followersCount);

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

module.exports = {
    getUserProfile,
    updateProfile,
    updateAvatar,
    requestEmailVerification,
    verifyEmail,
    requestSoftDelete,
    recoverAccount,
    toggleFollow,
    getFollowers,
    getFollowing,
    searchUsers,
    getSuggestions
};
