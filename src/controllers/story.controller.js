const storyModel = require('../models/story.model');

// POST /api/stories — Create story
const createStory = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Image is required for a story" });
        }

        const base64 = req.file.buffer.toString("base64");
        const image = `data:${req.file.mimetype};base64,${base64}`;

        const story = await storyModel.create({
            user: req.user._id,
            image
        });

        const populated = await story.populate("user", "username fullName avatar");

        res.status(201).json({ message: "Story created", story: populated });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/stories/feed — Stories from followed users
const getStoryFeed = async (req, res) => {
    try {
        const currentUser = req.user;

        const stories = await storyModel.find({
            user: { $in: [...currentUser.following, currentUser._id] },
            expiresAt: { $gt: new Date() }
        })
            .populate("user", "username fullName avatar")
            .sort({ createdAt: -1 });

        // Group stories by user
        const grouped = {};
        stories.forEach(story => {
            const userId = story.user._id.toString();
            if (!grouped[userId]) {
                grouped[userId] = {
                    user: story.user,
                    stories: []
                };
            }
            grouped[userId].stories.push(story);
        });

        res.status(200).json({ storyGroups: Object.values(grouped) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/stories/:id/view — Mark as viewed
const viewStory = async (req, res) => {
    try {
        const story = await storyModel.findById(req.params.id);

        if (!story) {
            return res.status(404).json({ message: "Story not found" });
        }

        story.viewers.addToSet(req.user._id);
        await story.save();

        res.status(200).json({ message: "Story viewed" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/stories/:id — Delete own story
const deleteStory = async (req, res) => {
    try {
        const story = await storyModel.findById(req.params.id);

        if (!story) {
            return res.status(404).json({ message: "Story not found" });
        }

        if (story.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You can only delete your own stories" });
        }

        await storyModel.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Story deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createStory,
    getStoryFeed,
    viewStory,
    deleteStory
};
