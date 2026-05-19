const postModel = require('../models/post.model');
const notificationModel = require('../models/notification.model');
const { uploadImage, deleteImage } = require('../utils/cloudinary');

// POST /api/posts — Create post
const createPost = async (req, res) => {
    try {
        const { caption, tags, location } = req.body;

        let image = null;
        if (req.file) {
            // Upload buffer to Cloudinary → get CDN URL
            image = await uploadImage(req.file.buffer, { folder: 'friendzone/posts' });
        }

        const post = await postModel.create({
            caption,
            image,
            user: req.user._id,
            tags: tags ? (Array.isArray(tags) ? tags : tags.split(",").map(t => t.trim())) : [],
            location: location || ""
        });

        const populated = await post.populate("user", "username fullName avatar");

        res.status(201).json({ message: "Post created", post: populated });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// GET /api/posts/feed — Posts from followed users
const getFeed = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const currentUser = req.user;

        const posts = await postModel.find({
            user: { $in: [...currentUser.following, currentUser._id] },
            isHidden: false
        })
            .populate("user", "username fullName avatar")
            .populate("comments.user", "username fullName avatar")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await postModel.countDocuments({
            user: { $in: [...currentUser.following, currentUser._id] },
            isHidden: false
        });

        res.status(200).json({
            posts,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/posts/explore — Trending / all posts
const getExplore = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const posts = await postModel.find({ isHidden: false })
            .populate("user", "username fullName avatar")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await postModel.countDocuments({ isHidden: false });

        res.status(200).json({
            posts,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/posts/:id — Get single post
const getPost = async (req, res) => {
    try {
        const post = await postModel.findById(req.params.id)
            .populate("user", "username fullName avatar")
            .populate("comments.user", "username fullName avatar")
            .populate("likes", "username fullName avatar");

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        res.status(200).json({ post });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/posts/:id — Edit own post
const updatePost = async (req, res) => {
    try {
        const post = await postModel.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        if (post.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You can only edit your own posts" });
        }

        const { caption, tags, location } = req.body;

        if (caption !== undefined) post.caption = caption;
        if (tags !== undefined) post.tags = Array.isArray(tags) ? tags : tags.split(",").map(t => t.trim());
        if (location !== undefined) post.location = location;

        await post.save();

        const updated = await postModel.findById(req.params.id)
            .populate("user", "username fullName avatar")
            .populate("comments.user", "username fullName avatar");

        res.status(200).json({ message: "Post updated", post: updated });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/posts/:id — Delete own post
const deletePost = async (req, res) => {
    try {
        const post = await postModel.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        if (post.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You can only delete your own posts" });
        }

        await postModel.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Post deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/posts/:id/like — Like/unlike toggle
const toggleLike = async (req, res) => {
    try {
        const post = await postModel.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const userId = req.user._id;
        const isLiked = post.likes.includes(userId);

        if (isLiked) {
            post.likes.pull(userId);
        } else {
            post.likes.addToSet(userId);

            // Notify post owner (if not self-like)
            if (post.user.toString() !== userId.toString()) {
                await notificationModel.create({
                    recipient: post.user,
                    sender: userId,
                    type: "like",
                    post: post._id,
                    message: `${req.user.username} liked your post`
                });
            }
        }

        await post.save();

        res.status(200).json({
            message: isLiked ? "Unliked" : "Liked",
            isLiked: !isLiked,
            likesCount: post.likes.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/posts/:id/comment — Add comment
const addComment = async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ message: "Comment text is required" });
        }

        const post = await postModel.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        post.comments.push({ user: req.user._id, text: text.trim() });
        await post.save();

        // Notify post owner (if not self-comment)
        if (post.user.toString() !== req.user._id.toString()) {
            await notificationModel.create({
                recipient: post.user,
                sender: req.user._id,
                type: "comment",
                post: post._id,
                message: `${req.user.username} commented on your post`
            });
        }

        const updatedPost = await postModel.findById(req.params.id)
            .populate("comments.user", "username fullName avatar");

        res.status(201).json({
            message: "Comment added",
            comments: updatedPost.comments
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/posts/:id/comment/:commentId — Delete comment
const deleteComment = async (req, res) => {
    try {
        const post = await postModel.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const comment = post.comments.id(req.params.commentId);

        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        // Allow comment author or post owner to delete
        if (
            comment.user.toString() !== req.user._id.toString() &&
            post.user.toString() !== req.user._id.toString()
        ) {
            return res.status(403).json({ message: "Not authorized to delete this comment" });
        }

        post.comments.pull(req.params.commentId);
        await post.save();

        res.status(200).json({ message: "Comment deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/posts/user/:userId — Get posts by user
const getUserPosts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        const posts = await postModel.find({
            user: req.params.userId,
            isHidden: false
        })
            .populate("user", "username fullName avatar")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await postModel.countDocuments({
            user: req.params.userId,
            isHidden: false
        });

        res.status(200).json({
            posts,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createPost,
    getFeed,
    getExplore,
    getPost,
    updatePost,
    deletePost,
    toggleLike,
    addComment,
    deleteComment,
    getUserPosts
};