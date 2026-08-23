const College = require('../models/college.model');
const University = require('../models/university.model');
const mongoose = require('mongoose');

// GET /api/colleges/search?q=&universityId=
const searchColleges = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const rawUni = req.query.universityId || req.query.university;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        const filter = { isActive: true };

        if (rawUni && rawUni.trim()) {
            const uniTrimmed = rawUni.trim();
            if (mongoose.Types.ObjectId.isValid(uniTrimmed)) {
                filter.university = new mongoose.Types.ObjectId(uniTrimmed);
            } else {
                const uDoc = await University.findOne({
                    name: new RegExp(`^${uniTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                    isActive: true
                }).select("_id");
                if (uDoc) {
                    filter.university = uDoc._id;
                } else {
                    return res.status(200).json({ colleges: [] });
                }
            }
        }

        if (query) {
            const regexQuery = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
            const orConditions = [
                { name: { $regex: regexQuery } },
                { code: { $regex: regexQuery } }
            ];
            if (filter.university) {
                filter.$and = [{ university: filter.university }, { $or: orConditions }];
                delete filter.university;
            } else {
                filter.$or = orConditions;
            }
        }

        const colleges = await College.find(filter)
            .populate("university", "name _id")
            .limit(limit)
            .sort({ name: 1 })
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
