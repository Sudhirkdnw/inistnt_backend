const confessionModel = require('../models/confession.model');
const notificationModel = require('../models/notification.model');
const commentModel = require('../models/comment.model');
const reportModel = require('../models/report.model');
const cache = require('../service/cache.service');
const userModel = require('../models/user.model');

// POST /api/confessions — Create confession
const createConfession = async (req, res) => {
    try {
        const { confessionText, category, isAnonymous } = req.body;

        if (!confessionText || !confessionText.trim()) {
            return res.status(400).json({ message: "Confession text is required" });
        }

        const { getSetting } = require('../utils/settings');

        // Check Max Length
        const maxLength = getSetting('max_confession_length', 2000);
        if (confessionText.length > maxLength) {
            return res.status(400).json({ message: `Confession too long. Max allowed: ${maxLength} chars.` });
        }

        // Check Anonymity Setting
        const allowAnon = getSetting('anonymous_confessions', true);
        const finalIsAnonymous = allowAnon ? (isAnonymous !== false) : false;

        // AI Moderation
        let isHidden = false;
        if (getSetting('ai_moderation', true)) {
            const { moderateContent } = require('../service/ai.service');
            const moderation = await moderateContent(confessionText);
            
            if (!moderation.isSafe) {
                const threshold = getSetting('ai_toxicity_threshold', 0.7);
                if (moderation.toxicityScore >= threshold && getSetting('auto_hide_toxic', true)) {
                    isHidden = true; // Still allow post but hide it immediately
                } else {
                    return res.status(403).json({ 
                        message: "Content rejected by AI moderation", 
                        reason: moderation.reason 
                    });
                }
            }
        }

        // Check Approval Mode
        if (getSetting('confession_approval_mode', false)) {
            isHidden = true;
        }

        const confession = await confessionModel.create({
            confessionText: confessionText.trim(),
            category: category || "secret",
            user: req.user._id,
            isAnonymous: finalIsAnonymous,
            isHidden: isHidden,
            collegeName: req.user.collegeName || ""
        });

        // Populate user only if NOT anonymous (for the creator's own view)
        const populated = await confession.populate("user", "username fullName avatar");

        res.status(201).json({ 
            message: isHidden ? "Confession submitted for approval" : "Confession posted", 
            confession: populated,
            isPending: isHidden
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/confessions/feed — Global latest confessions
const getFeed = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const category = req.query.category;
        const cursor = req.query.cursor; 

        const currentUser = req.user;

        // Optimized query: Avoid pre-fetching all user IDs.
        // We filter for non-hidden confessions from public users OR users we follow.
        const filter = {
            isHidden: false,
            collegeName: currentUser.collegeName || "",
            $or: [
                { isPrivate: { $ne: true } },
                { user: { $in: [...(currentUser.following || []), currentUser._id] } }
            ]
        };

        if (category) filter.category = category;
        if (cursor) filter._id = { $lt: cursor };

        const confessions = await confessionModel.find(filter)
            .select('confessionText category user isAnonymous likes commentCount createdAt')
            .populate("user", "username fullName avatar isPrivate")
            .sort({ _id: -1 })
            .limit(limit)
            .lean(); // Use lean for performance

        const sanitized = confessions.map(c => sanitizeConfession(c, currentUser._id));
        const nextCursor = confessions.length === limit ? confessions[confessions.length - 1]._id : null;

        res.status(200).json({
            confessions: sanitized,
            nextCursor,
            hasMore: confessions.length === limit
        });
    } catch (error) {
        console.error("getFeed error:", error);
        res.status(500).json({ message: "Error fetching feed" });
    }
};

// GET /api/confessions/explore — All confessions (trending/global)
const getExplore = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const cursor = req.query.cursor;
        const category = req.query.category || 'all';

        // Enterprise Cache Strategy: Cache global explore feed for 60 seconds
        const cacheKey = `explore:${category}:${cursor || 'start'}:${limit}`;
        
        const result = await cache.getOrSet(cacheKey, 60, async () => {
            const filter = { isHidden: false };
            if (category !== 'all') filter.category = category;
            if (cursor) filter._id = { $lt: cursor };

            const confessions = await confessionModel.find(filter)
                .select('confessionText category user isAnonymous likes commentCount createdAt')
                .populate("user", "username fullName avatar")
                .sort({ _id: -1 })
                .limit(limit)
                .lean();

            const nextCursor = confessions.length === limit ? confessions[confessions.length - 1]._id : null;

            return {
                confessions,
                nextCursor,
                hasMore: confessions.length === limit
            };
        });

        // Personalize sanitized results (since caching is global, we sanitize per-user request)
        const sanitized = result.confessions.map(c => sanitizeConfession(c, req.user._id));

        res.status(200).json({
            confessions: sanitized,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore
        });
    } catch (error) {
        console.error("getExplore error:", error);
        res.status(500).json({ message: "Error fetching explore feed" });
    }
};

// GET /api/confessions/:id — Get single confession
const getConfession = async (req, res) => {
    try {
        const confession = await confessionModel.findById(req.params.id)
            .select("confessionText category user isAnonymous likes commentCount isHidden isLocked isPinned isNSFW createdAt")
            .populate("user", "username fullName avatar isPrivate followers")
            .populate("likes", "username fullName avatar")
            .lean();

        if (!confession) {
            return res.status(404).json({ message: "Confession not found" });
        }

        if (confession.user && confession.user.isPrivate) {
            const isOwner = confession.user._id.toString() === req.user._id.toString();
            const isFollowing = confession.user.followers.includes(req.user._id);
            if (!isOwner && !isFollowing) {
                return res.status(403).json({ message: "This account is private" });
            }
        }

        res.status(200).json({ confession: sanitizeConfession(confession, req.user._id) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/confessions/:id — Delete own confession
const deleteConfession = async (req, res) => {
    try {
        const confession = await confessionModel.findById(req.params.id);

        if (!confession) {
            return res.status(404).json({ message: "Confession not found" });
        }

        if (confession.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You can only delete your own confessions" });
        }

        await confessionModel.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Confession deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/confessions/:id/like — Like/unlike toggle
const toggleLike = async (req, res) => {
    try {
        const confession = await confessionModel.findById(req.params.id);

        if (!confession) {
            return res.status(404).json({ message: "Confession not found" });
        }

        const userId = req.user._id;
        const isLiked = confession.likes.includes(userId);

        if (isLiked) {
            confession.likes.pull(userId);
        } else {
            confession.likes.addToSet(userId);

            // Notify confession owner (if not self-like and not anonymous)
            if (confession.user.toString() !== userId.toString()) {
                const notif = await notificationModel.create({
                    recipient: confession.user,
                    sender: userId,
                    type: "like",
                    confession: confession._id,
                    message: confession.isAnonymous
                        ? `Someone liked your confession`
                        : `${req.user.username} liked your confession`,
                    previewText: confession.confessionText.substring(0, 60) + (confession.confessionText.length > 60 ? "..." : "")
                });
                
                const io = req.app.get("io");
                if (io) {
                    const onlineUsers = io._onlineUsers || new Map();
                    const targetSocketId = onlineUsers.get(String(confession.user));
                    if (targetSocketId) {
                        const populatedNotif = await notificationModel.findById(notif._id)
                            .populate("sender", "username fullName avatar")
                            .populate("confession", "confessionText category");
                        io.to(targetSocketId).emit("new-notification", populatedNotif);
                    }
                }
            }
        }

        await confession.save();

        res.status(200).json({
            message: isLiked ? "Unliked" : "Liked",
            isLiked: !isLiked,
            likesCount: confession.likes.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/confessions/:id/comment — Add comment or reply
const addComment = async (req, res) => {
    try {
        const { text, parentCommentId } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ message: "Comment text is required" });
        }

        const confession = await confessionModel.findById(req.params.id);

        if (!confession) {
            return res.status(404).json({ message: "Confession not found" });
        }

        const newComment = await commentModel.create({
            user: req.user._id,
            confession: confession._id,
            parentCommentId: parentCommentId || null,
            text: text.trim()
        });

        const populatedComment = await newComment.populate("user", "username fullName avatar");

        let parentComment = null;
        if (parentCommentId) {
            parentComment = await commentModel.findById(parentCommentId);
            if (parentComment) {
                parentComment.replies.push(newComment._id);
                parentComment.replyCount += 1;
                await parentComment.save();
                
                if (parentComment.user.toString() !== req.user._id.toString()) {
                    const notif = await notificationModel.create({
                        recipient: parentComment.user,
                        sender: req.user._id,
                        type: "comment",
                        confession: confession._id,
                        commentId: parentComment._id,
                        replyId: newComment._id,
                        message: `${req.user.username} replied to your comment: "${parentComment.text.substring(0, 20)}..."`,
                        previewText: text.trim().substring(0, 60) + (text.trim().length > 60 ? "..." : "")
                    });
                    
                    const io = req.app.get("io");
                    if (io) {
                        const onlineUsers = io._onlineUsers || new Map();
                        const targetSocketId = onlineUsers.get(String(parentComment.user));
                        if (targetSocketId) {
                            const popNotif = await notificationModel.findById(notif._id)
                                .populate("sender", "username fullName avatar")
                                .populate("confession", "confessionText category");
                            io.to(targetSocketId).emit("new-notification", popNotif);
                        }
                    }
                }
            }
        } else {
            confession.commentCount += 1;
            await confession.save();
        }

        if (confession.user.toString() !== req.user._id.toString() && !parentCommentId) {
            const notif = await notificationModel.create({
                recipient: confession.user,
                sender: req.user._id,
                type: "comment",
                confession: confession._id,
                commentId: newComment._id,
                message: confession.isAnonymous
                    ? `Someone commented on your confession`
                    : `${req.user.username} commented on your confession`,
                previewText: text.trim().substring(0, 60) + (text.trim().length > 60 ? "..." : "")
            });
            
            const io = req.app.get("io");
            if (io) {
                const onlineUsers = io._onlineUsers || new Map();
                const targetSocketId = onlineUsers.get(String(confession.user));
                if (targetSocketId) {
                    const popNotif = await notificationModel.findById(notif._id)
                        .populate("sender", "username fullName avatar")
                        .populate("confession", "confessionText category");
                    io.to(targetSocketId).emit("new-notification", popNotif);
                }
            }
        }
        
        const io = req.app.get("io");
        let emitComment = populatedComment.toObject();
        if (confession.isAnonymous && emitComment.user._id.toString() === confession.user.toString()) {
            emitComment.user = { _id: null, username: "Anonymous Author", avatar: "" };
        }

        if (io) {
            io.emit(`new-comment-${confession._id}`, emitComment);
        }

        res.status(201).json({
            message: "Comment added",
            comment: emitComment
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/confessions/:id/comments
const getComments = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const cursor = req.query.cursor;

        const filter = {
            confession: req.params.id,
            parentCommentId: null
        };

        if (cursor) filter._id = { $lt: cursor };

        const comments = await commentModel.find(filter)
        .select("text user likes replyCount createdAt parentCommentId confession")
        .populate("user", "username fullName avatar")
        .sort({ _id: -1 })
        .limit(limit)
        .lean();

        const confession = await confessionModel.findById(req.params.id);

        let sanitizedComments = comments;
        if (confession && confession.isAnonymous) {
            sanitizedComments = sanitizedComments.map(c => {
                if (c.user && c.user._id.toString() === confession.user.toString()) {
                    if (c.user._id.toString() !== req.user._id.toString()) {
                        c.user = { _id: null, username: "Anonymous Author", avatar: "" };
                    }
                }
                return c;
            });
        }

        const nextCursor = comments.length === limit ? comments[comments.length - 1]._id : null;

        res.status(200).json({
            comments: sanitizedComments,
            nextCursor,
            hasMore: comments.length === limit
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/confessions/comment/:commentId/replies
const getReplies = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const cursor = req.query.cursor;

        const filter = { parentCommentId: req.params.commentId };
        
        if (cursor) filter._id = { $gt: cursor }; // Replies are sorted ascending so we use $gt for next page

        const replies = await commentModel.find(filter)
            .select("text user likes replyCount createdAt parentCommentId confession")
            .populate("user", "username fullName avatar")
            .sort({ _id: 1 })
            .limit(limit)
            .lean();
            
        // Need to check if the confession is anonymous to scrub author replies
        const parentComment = await commentModel.findById(req.params.commentId);
        let sanitizedReplies = replies;
        
        if (parentComment) {
            const confession = await confessionModel.findById(parentComment.confession);
            if (confession && confession.isAnonymous) {
                sanitizedReplies = sanitizedReplies.map(r => {
                    if (r.user && r.user._id.toString() === confession.user.toString()) {
                        if (r.user._id.toString() !== req.user._id.toString()) {
                            r.user = { _id: null, username: "Anonymous Author", avatar: "" };
                        }
                    }
                    return r;
                });
            }
        }

        const nextCursor = replies.length === limit ? replies[replies.length - 1]._id : null;

        res.status(200).json({
            replies: sanitizedReplies,
            nextCursor,
            hasMore: replies.length === limit
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/confessions/comment/:commentId
const deleteComment = async (req, res) => {
    try {
        const comment = await commentModel.findById(req.params.commentId);

        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        const confession = await confessionModel.findById(comment.confession);
        
        if (
            comment.user.toString() !== req.user._id.toString() &&
            (!confession || confession.user.toString() !== req.user._id.toString())
        ) {
            return res.status(403).json({ message: "Not authorized to delete this comment" });
        }

        if (!comment.parentCommentId && confession) {
            confession.commentCount = Math.max(0, confession.commentCount - 1);
            await confession.save();
        } else if (comment.parentCommentId) {
            const parent = await commentModel.findById(comment.parentCommentId);
            if (parent) {
                parent.replyCount = Math.max(0, parent.replyCount - 1);
                parent.replies.pull(comment._id);
                await parent.save();
            }
        }

        await commentModel.deleteMany({ parentCommentId: comment._id });
        await commentModel.findByIdAndDelete(comment._id);

        res.status(200).json({ message: "Comment deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/confessions/comment/:commentId/like
const toggleCommentLike = async (req, res) => {
    try {
        const comment = await commentModel.findById(req.params.commentId);

        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        const userId = req.user._id;
        const isLiked = comment.likes.includes(userId);

        if (isLiked) {
            comment.likes.pull(userId);
        } else {
            comment.likes.addToSet(userId);

            if (comment.user.toString() !== userId.toString()) {
                const notif = await notificationModel.create({
                    recipient: comment.user,
                    sender: userId,
                    type: "like",
                    confession: comment.confession,
                    commentId: comment._id,
                    message: `${req.user.username} liked your ${comment.parentCommentId ? 'reply' : 'comment'}`,
                    previewText: comment.text.substring(0, 60) + (comment.text.length > 60 ? "..." : "")
                });
                
                const io = req.app.get("io");
                if (io) {
                    const onlineUsers = io._onlineUsers || new Map();
                    const targetSocketId = onlineUsers.get(String(comment.user));
                    if (targetSocketId) {
                        const popNotif = await notificationModel.findById(notif._id)
                            .populate("sender", "username fullName avatar")
                            .populate("confession", "confessionText category");
                        io.to(targetSocketId).emit("new-notification", popNotif);
                    }
                }
            }
        }

        await comment.save();

        res.status(200).json({
            message: isLiked ? "Unliked" : "Liked",
            isLiked: !isLiked,
            likesCount: comment.likes.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/confessions/:id/report — Report a confession
const reportConfession = async (req, res) => {
    try {
        const confession = await confessionModel.findById(req.params.id);

        if (!confession) {
            return res.status(404).json({ message: "Confession not found" });
        }

        const userId = req.user._id;

        if (confession.reports.includes(userId)) {
            return res.status(400).json({ message: "You have already reported this confession" });
        }

        confession.reports.addToSet(userId);
        await confession.save();

        // Also create a proper report entry for the Admin Panel
        const report = await reportModel.create({
            reporter: userId,
            targetType: "confession",
            targetId: confession._id,
            reason: req.body.reason || "General Violation",
            description: req.body.description || ""
        });

        // Notify Admins
        const io = req.app.get("io");
        if (io) {
            const populatedReport = await reportModel.findById(report._id)
                .populate("reporter", "username avatar")
                .populate("targetId");
            io.emit("new-report", populatedReport);
        }

        res.status(200).json({ message: "Confession reported. Admin will review it." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/confessions/user/:userId — Get confessions by user (only non-anonymous or own)
const getUserConfessions = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 12, 50);
        const cursor = req.query.cursor;

        const isOwnProfile = req.params.userId === req.user._id.toString();

        const targetUser = await require('../models/user.model').findById(req.params.userId);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const isFollowing = targetUser.followers.includes(req.user._id);

        // If private, and not owner, and not following -> return empty
        if (targetUser.isPrivate && !isOwnProfile && !isFollowing) {
            return res.status(200).json({
                confessions: [],
                nextCursor: null,
                hasMore: false
            });
        }

        const filter = {
            user: req.params.userId,
            isHidden: false
        };

        // Only show non-anonymous confessions to other users
        if (!isOwnProfile) {
            filter.isAnonymous = false;
        }

        if (cursor) filter._id = { $lt: cursor };

        const confessions = await confessionModel.find(filter)
            .select("confessionText category user isAnonymous likes commentCount isHidden isLocked isPinned isNSFW createdAt")
            .populate("user", "username fullName avatar")
            .sort({ _id: -1 })
            .limit(limit)
            .lean();

        const nextCursor = confessions.length === limit ? confessions[confessions.length - 1]._id : null;

        res.status(200).json({
            confessions,
            nextCursor,
            hasMore: confessions.length === limit
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Strip user identity from anonymous confessions.
 * The original poster can still see their own identity.
 */
function sanitizeConfession(confession, currentUserId) {
    const obj = confession.toObject ? confession.toObject() : { ...confession };

    if (obj.isAnonymous && obj.user?._id?.toString() !== currentUserId?.toString()) {
        obj.user = {
            _id: null,
            username: "Anonymous",
            fullName: "Anonymous",
            avatar: ""
        };
    }
    return obj;
}

module.exports = {
    createConfession,
    getFeed,
    getExplore,
    getConfession,
    deleteConfession,
    toggleLike,
    addComment,
    getComments,
    getReplies,
    deleteComment,
    toggleCommentLike,
    reportConfession,
    getUserConfessions
};
