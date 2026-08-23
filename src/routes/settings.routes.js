const express = require("express");
const router = express.Router();
const { getSetting } = require("../utils/settings");
const Setting = require("../models/settings.model");

// GET /api/settings/public — Return non-sensitive settings & feature flags
router.get("/public", async (req, res) => {
    try {
        const publicKeys = [
            'platform_name', 'platform_description', 'support_email', 'support_phone',
            'company_name', 'company_address', 'default_currency', 'default_language',
            'timezone', 'date_format',
            'accent_color', 'secondary_color', 'app_logo', 'favicon', 'dark_mode_default',
            'homepage_banner_text', 'footer_text', 'maintenance_mode',
            'maintenance_message', 'new_registrations', 'registration_message',
            'dating_module', 'anonymous_chat', 'anonymous_confessions',
            'premium_photo_confessions_enabled',
            'allow_screenshots',
            'max_confession_length', 'min_dating_photos',
            'splash_day_url', 'splash_night_url'
        ];
        
        const settings = await Setting.find({ key: { $in: publicKeys } });
        const config = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {});

        // Fallback for premium_photo_confessions_enabled from cache
        if (config.premium_photo_confessions_enabled === undefined) {
            config.premium_photo_confessions_enabled = getSetting('premium_photo_confessions_enabled', false);
        }

        // Fallback for allow_screenshots from cache
        if (config.allow_screenshots === undefined) {
            config.allow_screenshots = getSetting('allow_screenshots', false);
        }

        res.status(200).json(config);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/settings/features — Return all feature flags
router.get("/features", async (req, res) => {
    try {
        const features = await Setting.find({ category: "Features" }).select("key value description category updatedAt");
        res.status(200).json({ success: true, features });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/settings/features/:key — Query status of specific feature flag
router.get("/features/:key", async (req, res) => {
    try {
        const { key } = req.params;
        const enabled = getSetting(key, false);
        const settingDoc = await Setting.findOne({ key });
        
        res.status(200).json({
            key,
            enabled: Boolean(enabled),
            description: settingDoc?.description || "",
            updatedAt: settingDoc?.updatedAt || new Date()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
