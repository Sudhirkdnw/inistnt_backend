const College = require('../models/college.model');

// GET /api/colleges/search?q=
const searchColleges = async (req, res) => {
    try {
        const query = req.query.q || "";
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);

        if (!query.trim()) {
            // Return some popular/default ones if no query
            const defaultColleges = await College.find({ isActive: true }).limit(limit).lean();
            return res.status(200).json({ colleges: defaultColleges });
        }

        // Search by regex
        const regexQuery = new RegExp(query.trim(), "i");
        const colleges = await College.find({
            isActive: true,
            $or: [
                { name: { $regex: regexQuery } },
                { aliases: { $regex: regexQuery } }
            ]
        })
        .limit(limit)
        .lean();

        res.status(200).json({ colleges });
    } catch (error) {
        console.error("searchColleges Error:", error);
        res.status(500).json({ message: "Failed to search colleges" });
    }
};

module.exports = {
    searchColleges
};
