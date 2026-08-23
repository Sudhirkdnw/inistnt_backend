const sharp = require("sharp");
const Advertisement = require("../models/advertisement.model");
const { uploadImage } = require("../utils/cloudinary");

/**
 * Validates if the image buffer has a 4:3 aspect ratio (allowing a tiny ±0.035 tolerance for pixel rounding).
 * @param {Buffer} buffer 
 * @returns {Promise<{ isValid: boolean, width: number, height: number, ratio: number }>}
 */
async function validateImageRatio(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        if (!metadata.width || !metadata.height) {
            return { isValid: false, message: "Invalid image format." };
        }
        const ratio = metadata.width / metadata.height;
        const TARGET_RATIO = 4 / 3; // 1.33333...
        const TOLERANCE = 0.035;

        const isValid = Math.abs(ratio - TARGET_RATIO) <= TOLERANCE;
        return {
            isValid,
            width: metadata.width,
            height: metadata.height,
            ratio
        };
    } catch (err) {
        return { isValid: false, message: err.message };
    }
}

/**
 * Validates standard web URLs (http/https only)
 */
function isValidWebUrl(url) {
    if (!url || typeof url !== "string") return true; // optional
    const trimmed = url.trim();
    if (!trimmed) return true;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Automatically update any expired active advertisements
 */
async function updateExpiredAds() {
    try {
        const now = new Date();
        await Advertisement.updateMany(
            {
                isDeleted: false,
                status: "ACTIVE",
                endAt: { $lt: now }
            },
            { $set: { status: "EXPIRED" } }
        );
    } catch (err) {
        console.error("Failed to auto-update expired ads:", err.message);
    }
}

// ─────────────────────────────────────────────────────────────
// 📱 CLIENT / MOBILE APP ENDPOINTS
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/advertisements/active
 * Returns active advertisements currently eligible for Home Feed.
 * Client receives ONLY safe fields (id, imageUrl, destinationUrl, priority).
 */
exports.getActiveAdvertisements = async (req, res) => {
    try {
        await updateExpiredAds();

        const now = new Date();
        const ads = await Advertisement.find({
            isDeleted: false,
            status: "ACTIVE",
            startAt: { $lte: now },
            endAt: { $gte: now }
        })
            .select("_id imageUrl destinationUrl priority")
            .sort({ priority: 1, createdAt: -1 })
            .limit(5)
            .lean();

        // Increment impressions asynchronously
        if (ads.length > 0) {
            const adIds = ads.map(a => a._id);
            Advertisement.updateMany(
                { _id: { $in: adIds } },
                { $inc: { impressionsCount: 1 } }
            ).catch(() => {});
        }

        return res.status(200).json({
            success: true,
            advertisements: ads
        });
    } catch (error) {
        console.error("Error in getActiveAdvertisements:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /api/advertisements/:id/click
 * Records a user click on an advertisement.
 */
exports.recordClick = async (req, res) => {
    try {
        const { id } = req.params;
        await Advertisement.findByIdAndUpdate(id, { $inc: { clicksCount: 1 } });
        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// 🛡️ ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/advertisements
 * List all advertisements for admin management with stats and pagination.
 */
exports.getAdminAdvertisements = async (req, res) => {
    try {
        await updateExpiredAds();

        const { search, status, page = 1, limit = 20 } = req.query;
        const query = { isDeleted: false };

        if (status && status !== "ALL") {
            query.status = status;
        }

        if (search && search.trim()) {
            query.name = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: "i" };
        }

        const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
        const take = Math.min(100, Math.max(1, parseInt(limit)));

        const [ads, total, totalStats] = await Promise.all([
            Advertisement.find(query)
                .populate("createdBy", "username fullName role")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(take)
                .lean(),
            Advertisement.countDocuments(query),
            Advertisement.aggregate([
                { $match: { isDeleted: false } },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                        totalClicks: { $sum: "$clicksCount" },
                        totalImpressions: { $sum: "$impressionsCount" }
                    }
                }
            ])
        ]);

        const statsMap = {
            TOTAL: 0,
            ACTIVE: 0,
            PAUSED: 0,
            EXPIRED: 0,
            DRAFT: 0,
            totalClicks: 0,
            totalImpressions: 0
        };

        totalStats.forEach(s => {
            if (statsMap[s._id] !== undefined) {
                statsMap[s._id] = s.count;
            }
            statsMap.TOTAL += s.count;
            statsMap.totalClicks += s.totalClicks || 0;
            statsMap.totalImpressions += s.totalImpressions || 0;
        });

        return res.status(200).json({
            success: true,
            advertisements: ads,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / take),
            stats: statsMap
        });
    } catch (error) {
        console.error("Error in getAdminAdvertisements:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /api/admin/advertisements
 * Create a new advertisement.
 */
exports.createAdvertisement = async (req, res) => {
    try {
        const { name, destinationUrl, startAt, endAt, status = "ACTIVE", priority = 1 } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Advertisement name is required." });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "Advertisement image is required." });
        }

        // 1. Strict Server-Side 4:3 Aspect Ratio Validation
        const ratioCheck = await validateImageRatio(req.file.buffer);
        if (!ratioCheck.isValid) {
            return res.status(400).json({
                success: false,
                message: "Advertisement image must have a 4:3 aspect ratio."
            });
        }

        // 2. Destination URL Validation
        if (destinationUrl && !isValidWebUrl(destinationUrl)) {
            return res.status(400).json({
                success: false,
                message: "Destination link must be a valid http:// or https:// URL."
            });
        }

        // 3. Date Validations
        if (!startAt || !endAt) {
            return res.status(400).json({ success: false, message: "Start date and end date are required." });
        }

        const startDate = new Date(startAt);
        const endDate = new Date(endAt);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid date format provided." });
        }

        if (endDate <= startDate) {
            return res.status(400).json({ success: false, message: "End date must be after start date." });
        }

        // 4. Upload Image to Cloudinary CDN
        const imageUrl = await uploadImage(req.file.buffer, {
            folder: "hykee/ads",
            transformation: [{ width: 1200, crop: "limit" }]
        }, req.file.mimetype);

        // Determine initial status based on current time & requested status
        let finalStatus = status;
        const now = new Date();
        if (endDate < now && finalStatus === "ACTIVE") {
            finalStatus = "EXPIRED";
        }

        const newAd = await Advertisement.create({
            name: name.trim(),
            imageUrl,
            destinationUrl: destinationUrl ? destinationUrl.trim() : "",
            startAt: startDate,
            endAt: endDate,
            status: finalStatus,
            priority: parseInt(priority) || 1,
            createdBy: req.user ? req.user._id : null
        });

        return res.status(201).json({
            success: true,
            message: "Advertisement created successfully.",
            advertisement: newAd
        });
    } catch (error) {
        console.error("Error in createAdvertisement:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /api/admin/advertisements/:id
 * Update an existing advertisement.
 */
exports.updateAdvertisement = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, destinationUrl, startAt, endAt, status, priority } = req.body;

        const ad = await Advertisement.findOne({ _id: id, isDeleted: false });
        if (!ad) {
            return res.status(404).json({ success: false, message: "Advertisement not found." });
        }

        if (name && name.trim()) {
            ad.name = name.trim();
        }

        if (destinationUrl !== undefined) {
            if (destinationUrl && !isValidWebUrl(destinationUrl)) {
                return res.status(400).json({
                    success: false,
                    message: "Destination link must be a valid http:// or https:// URL."
                });
            }
            ad.destinationUrl = destinationUrl ? destinationUrl.trim() : "";
        }

        if (startAt) {
            const startDate = new Date(startAt);
            if (isNaN(startDate.getTime())) {
                return res.status(400).json({ success: false, message: "Invalid start date format." });
            }
            ad.startAt = startDate;
        }

        if (endAt) {
            const endDate = new Date(endAt);
            if (isNaN(endDate.getTime())) {
                return res.status(400).json({ success: false, message: "Invalid end date format." });
            }
            ad.endAt = endDate;
        }

        if (ad.endAt <= ad.startAt) {
            return res.status(400).json({ success: false, message: "End date must be after start date." });
        }

        // If a new image is uploaded, validate 4:3 aspect ratio
        if (req.file) {
            const ratioCheck = await validateImageRatio(req.file.buffer);
            if (!ratioCheck.isValid) {
                return res.status(400).json({
                    success: false,
                    message: "Advertisement image must have a 4:3 aspect ratio."
                });
            }

            const imageUrl = await uploadImage(req.file.buffer, {
                folder: "hykee/ads",
                transformation: [{ width: 1200, crop: "limit" }]
            }, req.file.mimetype);

            ad.imageUrl = imageUrl;
        }

        if (status) {
            const now = new Date();
            if (status === "ACTIVE" && ad.endAt < now) {
                ad.status = "EXPIRED";
            } else {
                ad.status = status;
            }
        }

        if (priority !== undefined) {
            ad.priority = parseInt(priority) || 1;
        }

        await ad.save();

        return res.status(200).json({
            success: true,
            message: "Advertisement updated successfully.",
            advertisement: ad
        });
    } catch (error) {
        console.error("Error in updateAdvertisement:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PATCH /api/admin/advertisements/:id/status
 * Toggle advertisement status between ACTIVE / PAUSED.
 */
exports.toggleAdStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const ad = await Advertisement.findOne({ _id: id, isDeleted: false });
        if (!ad) {
            return res.status(404).json({ success: false, message: "Advertisement not found." });
        }

        const now = new Date();
        if (status === "ACTIVE" && ad.endAt < now) {
            return res.status(400).json({
                success: false,
                message: "Cannot activate an advertisement whose end time has already passed. Please extend the end date first."
            });
        }

        ad.status = status || (ad.status === "ACTIVE" ? "PAUSED" : "ACTIVE");
        await ad.save();

        return res.status(200).json({
            success: true,
            message: `Advertisement status changed to ${ad.status}.`,
            status: ad.status
        });
    } catch (error) {
        console.error("Error in toggleAdStatus:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * DELETE /api/admin/advertisements/:id
 * Soft delete an advertisement.
 */
exports.deleteAdvertisement = async (req, res) => {
    try {
        const { id } = req.params;
        const ad = await Advertisement.findByIdAndUpdate(
            id,
            { isDeleted: true, status: "PAUSED" },
            { returnDocument: "after" }
        );

        if (!ad) {
            return res.status(404).json({ success: false, message: "Advertisement not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Advertisement deleted successfully."
        });
    } catch (error) {
        console.error("Error in deleteAdvertisement:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
