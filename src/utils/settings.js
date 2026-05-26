const Setting = require("../models/settings.model");

let cachedSettings = {};

/**
 * Synchronize database with defaults without slowing down runtime requests
 */
const syncSettings = async () => {
    try {
        const defaults = [
            { key: 'platform_name', value: 'Inistnt', description: 'The public name of the platform', category: 'General' },
            { key: 'platform_description', value: 'College Confession & Dating Platform', description: 'SEO description of the site', category: 'General' },
            { key: 'support_email', value: 'support@inistnt.in', description: 'Official contact email for users', category: 'General' },
            { key: 'support_phone', value: '+91 70707 99200', description: 'Support contact number', category: 'General' },
            { key: 'company_name', value: 'Inistnt', description: 'Legal company name', category: 'General' },
            { key: 'company_address', value: 'Greater Noida', description: 'Business address', category: 'General' },
            { key: 'default_language', value: 'en', description: 'System default language', category: 'General' },
            { key: 'default_currency', value: 'IN', description: 'Platform currency code', category: 'General' },
            { key: 'timezone', value: 'UTC', description: 'System default timezone', category: 'General' },
            { key: 'date_format', value: 'MMM DD, YYYY', description: 'Display date format', category: 'General' },
            { key: 'maintenance_mode', value: false, description: 'Disable all user interactions', category: 'Security' },
            { key: 'maintenance_message', value: 'We are performing system upgrades. Please check back later.', category: 'Security' },
            { key: 'new_registrations', value: true, category: 'Security' },
            { key: 'registration_message', value: 'Welcome!', category: 'Security' },
            { key: 'allowed_email_domains', value: '*', category: 'Security' },
            { key: 'blocked_email_domains', value: '', category: 'Security' },
            { key: 'otp_verification', value: false, category: 'Security' },
            { key: 'session_timeout', value: 24, category: 'Security' },
            { key: 'ai_moderation', value: true, category: 'Moderation' },
            { key: 'ai_toxicity_threshold', value: 0.7, category: 'Moderation' },
            { key: 'auto_hide_toxic', value: true, category: 'Moderation' },
            { key: 'anonymous_confessions', value: true, category: 'Content' },
            { key: 'max_confession_length', value: 2000, category: 'Content' },
            { key: 'confession_approval_mode', value: false, category: 'Content' },
            { key: 'homepage_banner_text', value: 'The safest place for your secrets.', category: 'Content' },
            { key: 'footer_text', value: '© 2026 Inistnt. All rights reserved.', category: 'Content' },
            { key: 'anonymous_chat', value: true, category: 'Features' },
            { key: 'dating_module', value: true, category: 'Features' },
            { key: 'min_dating_photos', value: 1, category: 'Features' },
            { key: 'app_logo', value: '', category: 'Branding' },
            { key: 'favicon', value: '', category: 'Branding' },
            { key: 'accent_color', value: '#0095f6', category: 'Branding' },
            { key: 'secondary_color', value: '#1a1a1a', category: 'Branding' },
            { key: 'dark_mode_default', value: true, category: 'Branding' },

            // Mail Settings
            { key: 'mail_protocol', value: 'smtp', description: 'Email delivery protocol (smtp/sendmail)', category: 'Mail' },
            { key: 'mail_host', value: 'smtp.gmail.com', description: 'SMTP server host', category: 'Mail' },
            { key: 'mail_port', value: 587, description: 'SMTP server port (usually 587 or 465)', category: 'Mail' },
            { key: 'mail_encryption', value: 'tls', description: 'Encryption method (tls/ssl/none)', category: 'Mail' },
            { key: 'mail_username', value: '', description: 'SMTP username/email', category: 'Mail' },
            { key: 'mail_password', value: '', description: 'SMTP password (stored encrypted)', category: 'Mail' },
            { key: 'mail_from_address', value: 'support@inistnt.in', description: 'Sender email address', category: 'Mail' },
            { key: 'mail_from_name', value: 'Inistnt', description: 'Sender display name', category: 'Mail' },
            { key: 'mail_reply_to', value: 'support@inistnt.in', description: 'Reply-to email address', category: 'Mail' }
        ];

        // Bulk upsert logic
        const bulkOps = defaults.map(d => ({
            updateOne: {
                filter: { key: d.key },
                update: {
                    $setOnInsert: { value: d.value },
                    $set: { category: d.category, description: d.description }
                },
                upsert: true
            }
        }));

        await Setting.bulkWrite(bulkOps);
        console.log("✅ System configuration synchronized with defaults");

        // Auto-correct outdated values in database settings collection to prevent unverified domain delivery failures
        const mailFromAddressRes = await Setting.updateMany(
            { key: { $in: ["mail_from_address", "mail_reply_to", "support_email"] }, value: /socialmini\.edu/ },
            { $set: { value: "support@inistnt.in" } }
        );
        if (mailFromAddressRes.modifiedCount > 0) {
            console.log(`[Migration] Updated ${mailFromAddressRes.modifiedCount} mail settings with old domain 'socialmini.edu' to 'support@inistnt.in'`);
        }

        const platformNameRes = await Setting.updateMany(
            { key: { $in: ["platform_name", "company_name"] }, value: { $in: ["Social Mini", "Zynk", "SocialMini", "social_mini"] } },
            { $set: { value: "Inistnt" } }
        );
        if (platformNameRes.modifiedCount > 0) {
            console.log(`[Migration] Updated ${platformNameRes.modifiedCount} platform/company name settings to 'Inistnt'`);
        }

        const footerTextRes = await Setting.updateMany(
            { key: "footer_text", value: /Social Mini|Zynk/ },
            { $set: { value: "© 2026 Inistnt. All rights reserved." } }
        );
        if (footerTextRes.modifiedCount > 0) {
            console.log(`[Migration] Updated footer text to use 'Inistnt'`);
        }
    } catch (err) {
        console.error("❌ Failed to sync settings:", err.message);
    }
};

/**
 * Loads all settings from DB into memory
 */
const loadSettings = async () => {
    try {
        await syncSettings(); // Run once at boot
        const settings = await Setting.find();
        cachedSettings = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {});
        console.log("✅ System settings loaded into memory cache");
    } catch (err) {
        console.error("❌ Failed to load settings:", err.message);
    }
};

/**
 * Get a setting value from cache
 * @param {string} key 
 * @param {any} defaultValue 
 */
const getSetting = (key, defaultValue = null) => {
    return cachedSettings[key] !== undefined ? cachedSettings[key] : defaultValue;
};

/**
 * Update a setting in DB and sync cache
 * @param {string} key 
 * @param {any} value 
 */
const updateSettingInCache = (key, value) => {
    cachedSettings[key] = value;
};

module.exports = {
    loadSettings,
    getSetting,
    updateSettingInCache
};
