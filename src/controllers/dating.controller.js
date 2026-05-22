const DatingProfile = require("../models/dating.model");
const userModel = require("../models/user.model");
const notificationModel = require("../models/notification.model");
const { uploadImage, deleteImage } = require("../utils/cloudinary");

// Create or update dating profile
async function setupProfile(req, res) {
    try {
        const { gender, interestedIn, interests, bio, age, photos } = req.body;
        const userId = req.user._id;

        let profile = await DatingProfile.findOne({ user: userId });

        if (profile) {
            // Update existing
            if (gender) profile.gender = gender;
            if (interestedIn) profile.interestedIn = interestedIn;
            if (interests) profile.interests = interests;
            if (bio !== undefined) profile.bio = bio;
            if (age) profile.age = age;
            
            // Activation logic: User can only activate if they have >= min_dating_photos
            const { getSetting } = require("../utils/settings");
            const photoCount = profile.photos ? profile.photos.length : 0;
            if (req.body.isDatingActive === true) {
                const minPhotos = getSetting('min_dating_photos', 4);
                if (photoCount < minPhotos) {
                    return res.status(400).json({ message: `You must upload at least ${minPhotos} photos to activate dating profile` });
                }
                profile.isDatingActive = true;
            } else if (req.body.isDatingActive === false) {
                profile.isDatingActive = false;
            }

            await profile.save();
        } else {
            // Create new
            profile = await DatingProfile.create({
                user: userId,
                gender,
                interestedIn: interestedIn || (gender === "male" ? "female" : "male"),
                interests: interests || [],
                bio: bio || "",
                age,
                photos: [],
                photoOrder: [],
                isDatingActive: false
            });
        }

        await profile.populate("user", "username fullName avatar");
        res.status(200).json({ message: "Profile saved", profile });
    } catch (err) {
        console.error("setupProfile error:", err);
        res.status(500).json({ message: "Server error" });
    }
}

// Get my dating profile
async function getMyProfile(req, res) {
    try {
        const profile = await DatingProfile.findOne({ user: req.user._id })
            .populate("user", "username fullName avatar");
        
        if (!profile) {
            return res.status(200).json({ 
                success: true,
                hasDatingProfile: false, 
                profile: null 
            });
        }
        
        res.status(200).json({ 
            success: true,
            hasDatingProfile: true,
            profile 
        });
    } catch (err) {
        console.error("getMyProfile error:", err);
        res.status(500).json({ message: "Server error" });
    }
}

// Get discovery cards (swipe stack)
async function getDiscovery(req, res) {
    try {
        const { getSetting } = require("../utils/settings");
        if (!getSetting('dating_module', true)) {
            return res.status(403).json({ message: "Dating module is currently disabled by administrator" });
        }

        const userId = req.user._id;
        const myProfile = await DatingProfile.findOne({ user: userId }).lean();

        if (!myProfile) {
            return res.status(400).json({ message: "Please set up your dating profile first" });
        }

        // Determine gender filter
        let genderFilter = {};
        if (myProfile.interestedIn === "male") genderFilter = { gender: "male" };
        else if (myProfile.interestedIn === "female") genderFilter = { gender: "female" };

        // Exclude logic
        const excludeIds = [
            userId,
            ...(myProfile.likedUsers || []),
            ...(myProfile.passedUsers || []),
            ...(myProfile.matches || [])
        ];

        let candidates = await DatingProfile.find({
            user: { $nin: excludeIds },
            isDatingActive: true,
            ...genderFilter
        })
        .select('user gender interestedIn interests bio age photos photoOrder')
        .populate("user", "username fullName avatar collegeName verificationStatus")
        .limit(20)
        .lean();

        // Filter out orphaned dating profiles (where the user account was deleted)
        candidates = candidates.filter(c => c.user != null);

        res.status(200).json({ candidates });
    } catch (err) {
        console.error("getDiscovery error:", err);
        res.status(500).json({ message: "Server error" });
    }
}

// Swipe right (like)
async function swipeRight(req, res) {
    try {
        const userId = req.user._id;
        const { targetUserId } = req.params;

        const myProfile = await DatingProfile.findOne({ user: userId });
        const theirProfile = await DatingProfile.findOne({ user: targetUserId });

        if (!myProfile || !theirProfile) {
            return res.status(404).json({ message: "Profile not found" });
        }

        // Add to liked
        if (!myProfile.likedUsers.includes(targetUserId)) {
            myProfile.likedUsers.push(targetUserId);
            await myProfile.save();
        }

        // Check if they already liked me back → MATCH!
        let isMatch = false;
        
        // ── Populate the current user for notification message ──
        const meUser = await userModel.findById(userId).select("username fullName avatar");

        if (theirProfile.likedUsers.includes(userId)) {
            // Create mutual match
            if (!myProfile.matches.includes(targetUserId)) {
                myProfile.matches.push(targetUserId);
                await myProfile.save();
            }
            if (!theirProfile.matches.includes(userId)) {
                theirProfile.matches.push(userId);
                await theirProfile.save();
            }
            isMatch = true;

            // 1️⃣  Save a persistent DB notification for the other user
            await notificationModel.create({
                recipient: targetUserId,
                sender: userId,
                type: "dating_match",
                message: `${meUser.username} is interested in you! You have a new match 💘`
            });

            // 2️⃣  Emit a real-time socket event so they see it instantly
            const io = req.app.get("io");
            if (io) {
                const onlineUsers = io._onlineUsers || new Map();
                const targetSocketId = onlineUsers.get(String(targetUserId));
                const payload = {
                    type: "dating_match",
                    sender: {
                        _id: meUser._id,
                        username: meUser.username,
                        fullName: meUser.fullName,
                        avatar: meUser.avatar
                    },
                    message: `${meUser.username} is interested in you! You have a new match 💘`,
                    createdAt: new Date().toISOString()
                };

                if (targetSocketId) {
                    io.to(targetSocketId).emit("dating-match", payload);
                } else {
                    io.emit(`dating-match-${targetUserId}`, payload);
                }
            }
        } else {
            // Not a match yet. Send a dating_like notification
            await notificationModel.create({
                recipient: targetUserId,
                sender: userId,
                type: "dating_like",
                message: `${meUser.username} is interested in you! 💘`
            });

            const io = req.app.get("io");
            if (io) {
                const onlineUsers = io._onlineUsers || new Map();
                const targetSocketId = onlineUsers.get(String(targetUserId));
                const payload = {
                    type: "dating_like",
                    sender: {
                        _id: meUser._id,
                        username: meUser.username,
                        fullName: meUser.fullName,
                        avatar: meUser.avatar
                    },
                    message: `${meUser.username} is interested in you! 💘`,
                    createdAt: new Date().toISOString()
                };

                if (targetSocketId) {
                    io.to(targetSocketId).emit("dating-like", payload);
                } else {
                    io.emit(`dating-like-${targetUserId}`, payload);
                }
            }
        }

        res.status(200).json({
            message: isMatch ? "It's a Match! 🎉" : "Liked!",
            isMatch
        });
    } catch (err) {
        console.error("swipeRight error:", err);
        res.status(500).json({ message: "Server error" });
    }
}


// Swipe left (pass)
async function swipeLeft(req, res) {
    try {
        const userId = req.user._id;
        const { targetUserId } = req.params;

        const myProfile = await DatingProfile.findOne({ user: userId });
        if (!myProfile) return res.status(404).json({ message: "Profile not found" });

        if (!myProfile.passedUsers.includes(targetUserId)) {
            myProfile.passedUsers.push(targetUserId);
            await myProfile.save();
        }

        res.status(200).json({ message: "Passed" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
}

// Get all matches
async function getMatches(req, res) {
    try {
        const userId = req.user._id;
        const myProfile = await DatingProfile.findOne({ user: userId })
            .populate({
                path: "matches",
                select: "username fullName avatar collegeName verificationStatus"
            });

        if (!myProfile) return res.status(200).json({ matches: [] });

        // Get their dating profiles too (for interests)
        const matchDetails = await Promise.all(
            myProfile.matches.map(async (matchUser) => {
                const dp = await DatingProfile.findOne({ user: matchUser._id });
                return {
                    user: matchUser,
                    interests: dp?.interests || [],
                    bio: dp?.bio || "",
                    age: dp?.age
                };
            })
        );

        res.status(200).json({ matches: matchDetails });
    } catch (err) {
        console.error("getMatches error:", err);
        res.status(500).json({ message: "Server error" });
    }
}

// Unmatch
async function unmatch(req, res) {
    try {
        const userId = req.user._id;
        const { targetUserId } = req.params;

        await DatingProfile.updateOne(
            { user: userId },
            { $pull: { matches: targetUserId } }
        );
        await DatingProfile.updateOne(
            { user: targetUserId },
            { $pull: { matches: userId } }
        );

        res.status(200).json({ message: "Unmatched" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
}

// Upload dating photo
async function uploadDatingPhoto(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No image provided" });
        }

        const userId = req.user._id;
        let profile = await DatingProfile.findOne({ user: userId });

        if (!profile) {
            // Create a skeleton profile if they upload photos before clicking save
            profile = await DatingProfile.create({
                user: userId,
                gender: "other", // Placeholders, will be updated when they click save
                interestedIn: "both",
                interests: [],
                bio: "",
                photos: [],
                photoOrder: [],
                isDatingActive: false
            });
        }

        if (profile.photos.length >= 6) {
            return res.status(400).json({ message: "Maximum 6 photos allowed" });
        }

        const photoUrl = await uploadImage(req.file.buffer, {
            folder: 'inistnt/dating',
            transformation: [
                { width: 1000, height: 1200, crop: 'fill', gravity: 'auto' } // High quality portrait crop
            ]
        }, req.file.mimetype);

        profile.photos.push(photoUrl);
        profile.photoOrder.push(photoUrl);
        await profile.save();

        res.status(200).json({ message: "Photo uploaded", photoUrl, profile });
    } catch (err) {
        console.error("uploadDatingPhoto error:", err);
        res.status(500).json({ message: "Server error" });
    }
}

// Delete dating photo
async function deleteDatingPhoto(req, res) {
    try {
        const { photoUrl } = req.body;
        const userId = req.user._id;

        const profile = await DatingProfile.findOne({ user: userId });
        if (!profile) return res.status(404).json({ message: "Profile not found" });

        // Remove from Cloudinary
        await deleteImage(photoUrl);

        // Remove from DB
        profile.photos = profile.photos.filter(p => p !== photoUrl);
        profile.photoOrder = profile.photoOrder.filter(p => p !== photoUrl);

        // Auto-deactivate if photos fall below 4
        if (profile.photos.length < 4) {
            profile.isDatingActive = false;
        }

        await profile.save();
        res.status(200).json({ message: "Photo deleted", profile });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
}

// Reorder dating photos
async function reorderDatingPhotos(req, res) {
    try {
        const { photoOrder } = req.body;
        const userId = req.user._id;

        const profile = await DatingProfile.findOne({ user: userId });
        if (!profile) return res.status(404).json({ message: "Profile not found" });

        // Basic validation: ensure all photos are present in the new order
        const isMatch = photoOrder.length === profile.photos.length && 
                        photoOrder.every(p => profile.photos.includes(p));
        
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid photo order" });
        }

        profile.photoOrder = photoOrder;
        await profile.save();

        res.status(200).json({ message: "Order updated", profile });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
}

module.exports = {
    setupProfile,
    getMyProfile,
    getDiscovery,
    swipeRight,
    swipeLeft,
    getMatches,
    unmatch,
    uploadDatingPhoto,
    deleteDatingPhoto,
    reorderDatingPhotos
};
