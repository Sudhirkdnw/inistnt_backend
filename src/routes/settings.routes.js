const express = require("express");
const router = express.Router();
const { getSetting } = require("../utils/settings");
const Setting = require("../models/settings.model");

// GET /api/settings/public
router.get("/public", async (req, res) => {
    try {
        // Only return non-sensitive settings
        const publicKeys = [
            'platform_name', 'platform_description', 'support_email', 
            'default_language', 'accent_color', 'app_logo', 'favicon',
            'homepage_banner_text', 'footer_text', 'maintenance_mode',
            'maintenance_message', 'new_registrations', 'registration_message',
            'dating_module', 'anonymous_chat', 'splash_day_url', 'splash_night_url'
        ];
        
        const settings = await Setting.find({ key: { $in: publicKeys } });
        const config = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {});

        res.status(200).json(config);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
