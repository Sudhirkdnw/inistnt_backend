const { generateCaption, generateHashtags, generateBio, improveBio } = require("../service/ai.service");

// POST /api/ai/caption
const getAICaption = async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ message: "Prompt is required" });
        }

        const caption = await generateCaption(prompt);
        res.status(200).json({ caption });
    } catch (error) {
        res.status(500).json({ message: "AI service error: " + error.message });
    }
};

// POST /api/ai/hashtags
const getAIHashtags = async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ message: "Prompt is required" });
        }

        const hashtags = await generateHashtags(prompt);
        res.status(200).json({ hashtags });
    } catch (error) {
        res.status(500).json({ message: "AI service error: " + error.message });
    }
};

// POST /api/ai/bio/generate
const getAIBio = async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ message: "Prompt is required" });
        }

        const bio = await generateBio(prompt);
        res.status(200).json({ bio });
    } catch (error) {
        res.status(500).json({ message: "AI service error: " + error.message });
    }
};

// POST /api/ai/bio/improve
const improveAIBio = async (req, res) => {
    try {
        const { currentBio, instructions } = req.body;
        if (!currentBio && !instructions) {
            return res.status(400).json({ message: "Current bio or instructions are required" });
        }

        const bio = await improveBio(currentBio || "", instructions || "make it better");
        res.status(200).json({ bio });
    } catch (error) {
        res.status(500).json({ message: "AI service error: " + error.message });
    }
};

module.exports = { getAICaption, getAIHashtags, getAIBio, improveAIBio };
