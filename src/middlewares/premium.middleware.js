const { getPremiumSettingsCached } = require("../utils/premiumSettingsCache");

async function checkPremiumAccess(req, res, next) {
    try {
        // 1. Get global settings
        let settings = await getPremiumSettingsCached();
        
        // If settings doc doesn't exist, we assume premium requirement is ON
        const isPremiumRequired = settings ? settings.isPremiumRequired : true;

        if (!isPremiumRequired) {
            // Premium requirement is disabled globally by Admin, so allow free access
            return next();
        }

        // 2. Check if user is authenticated (authMiddleware should run first)
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // 3. Admin role has bypass/free access
        if (req.user.role === "admin") {
            return next();
        }

        // 4. Verify user premium status
        const now = new Date();
        const isPremium = req.user.isPremium && req.user.premiumExpireAt && new Date(req.user.premiumExpireAt) > now;

        if (!isPremium) {
            return res.status(403).json({ 
                message: "Premium subscription required to access dating features",
                requiresPremiumUpgrade: true
            });
        }

        next();
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = { checkPremiumAccess };
