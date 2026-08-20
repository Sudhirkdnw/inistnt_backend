const express = require("express");
const router = express.Router();
const { getSetting } = require("../utils/settings");
const Setting = require("../models/settings.model");

// GET /api/settings/public
router.get("/public", async (req, res) => {
    try {
        // Only return non-sensitive settings
        const publicKeys = [
            'platform_name', 'platform_description', 'support_email', 'support_phone',
            'company_name', 'company_address', 'default_currency', 'default_language',
            'timezone', 'date_format',
            'accent_color', 'secondary_color', 'app_logo', 'favicon', 'dark_mode_default',
            'homepage_banner_text', 'footer_text', 'maintenance_mode',
            'maintenance_message', 'new_registrations', 'registration_message',
            'dating_module', 'anonymous_chat', 'anonymous_confessions',
            'max_confession_length', 'min_dating_photos',
            'splash_day_url', 'splash_night_url'
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
