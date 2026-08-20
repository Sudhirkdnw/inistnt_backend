const Setting = require("../models/settings.model");
const mongoose = require("mongoose");

let cachedSettings = {};

/**
 * Synchronize database with defaults without slowing down runtime requests
 */
const syncSettings = async () => {
    try {
        const defaults = [
            { key: 'platform_name', value: 'Hykee', description: 'The public name of the platform', category: 'General' },
            { key: 'platform_description', value: 'College Confession & Dating Platform', description: 'SEO description of the site', category: 'General' },
            { key: 'support_email', value: 'support@hykee.in', description: 'Official contact email for users', category: 'General' },
            { key: 'support_phone', value: '+91 70707 99200', description: 'Support contact number', category: 'General' },
            { key: 'company_name', value: 'Hykee', description: 'Legal company name', category: 'General' },
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
            { key: 'ai_service_enabled', value: true, category: 'AI', description: 'Enable or disable AI features globally' },
            { key: 'ai_api_key', value: '', category: 'AI', description: 'API Key for Groq AI SDK (overrides environment variable)' },
            { key: 'ai_model', value: 'openai/gpt-oss-120b', category: 'AI', description: 'Groq Model name to use' },
            { key: 'ai_moderation', value: true, category: 'AI' },
            { key: 'ai_toxicity_threshold', value: 0.7, category: 'AI' },
            { key: 'auto_hide_toxic', value: true, category: 'AI' },
            { key: 'anonymous_confessions', value: true, category: 'Content' },
            { key: 'max_confession_length', value: 2000, category: 'Content' },
            { key: 'confession_approval_mode', value: false, category: 'Content' },
            { key: 'homepage_banner_text', value: 'The safest place for your secrets.', category: 'Content' },
            { key: 'footer_text', value: '© 2026 Hykee. All rights reserved.', category: 'Content' },
            { key: 'anonymous_chat', value: true, category: 'Features' },
            { key: 'dating_module', value: true, category: 'Features' },
            { key: 'min_dating_photos', value: 1, category: 'Features' },
            { key: 'app_logo', value: '', category: 'Branding' },
            { key: 'favicon', value: '', category: 'Branding' },
            { key: 'accent_color', value: '#0095f6', category: 'Branding' },
            { key: 'secondary_color', value: '#1a1a1a', category: 'Branding' },
            { key: 'dark_mode_default', value: true, category: 'Branding' },
            { key: 'splash_day_url', value: '', category: 'Branding', description: 'URL for day splash screen image' },
            { key: 'splash_night_url', value: '', category: 'Branding', description: 'URL for night splash screen image' },
 
            // Mail Settings
            { key: 'mail_protocol', value: 'smtp', description: 'Email delivery protocol (smtp/sendmail)', category: 'Mail' },
            { key: 'mail_host', value: 'smtp.gmail.com', description: 'SMTP server host', category: 'Mail' },
            { key: 'mail_port', value: 587, description: 'SMTP server port (usually 587 or 465)', category: 'Mail' },
            { key: 'mail_encryption', value: 'tls', description: 'Encryption method (tls/ssl/none)', category: 'Mail' },
            { key: 'mail_username', value: '', description: 'SMTP username/email', category: 'Mail' },
            { key: 'mail_password', value: '', description: 'SMTP password (stored encrypted)', category: 'Mail' },
            { key: 'mail_from_address', value: 'support@hykee.in', description: 'Sender email address', category: 'Mail' },
            { key: 'mail_from_name', value: 'Hykee', description: 'Sender display name', category: 'Mail' },
            { key: 'mail_reply_to', value: 'support@hykee.in', description: 'Reply-to email address', category: 'Mail' }
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
            { key: { $in: ["mail_from_address", "mail_reply_to", "support_email"] }, value: { $in: [/socialmini\.edu/, /inistnt\.in/] } },
            { $set: { value: "support@hykee.in" } }
        );
        if (mailFromAddressRes.modifiedCount > 0) {
            console.log(`[Migration] Updated ${mailFromAddressRes.modifiedCount} mail settings with old domains to 'support@hykee.in'`);
        }
 
        const platformNameRes = await Setting.updateMany(
            { key: { $in: ["platform_name", "company_name"] }, value: { $in: ["Social Mini", "Zynk", "SocialMini", "social_mini", "Inistnt"] } },
            { $set: { value: "Hykee" } }
        );
        if (platformNameRes.modifiedCount > 0) {
            console.log(`[Migration] Updated ${platformNameRes.modifiedCount} platform/company name settings to 'Hykee'`);
        }

        // Migrate deprecated / invalid AI models in DB settings
        const aiModelRes = await Setting.updateMany(
            { key: "ai_model", value: { $in: ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "llama-3.1-8b-instant", ""] } },
            { $set: { value: "openai/gpt-oss-120b" } }
        );
        if (aiModelRes.modifiedCount > 0) {
            console.log(`[Migration] Updated ${aiModelRes.modifiedCount} ai_model settings to 'openai/gpt-oss-120b'`);
        }
 
        const footerTextRes = await Setting.updateMany(
            { key: "footer_text", value: /Social Mini|Zynk|Inistnt/ },
            { $set: { value: "© 2026 Hykee. All rights reserved." } }
        );
        if (footerTextRes.modifiedCount > 0) {
            console.log(`[Migration] Updated footer text to use 'Hykee'`);
        }
        
        const mailFromNameRes = await Setting.updateMany(
            { key: "mail_from_name", value: "Inistnt" },
            { $set: { value: "Hykee" } }
        );
        if (mailFromNameRes.modifiedCount > 0) {
            console.log(`[Migration] Updated mail sender name setting to 'Hykee'`);
        }
    } catch (err) {
        console.error("❌ Failed to sync settings:", err.message);
    }
};

let isSynced = false;

/**
 * Loads all settings from DB into memory
 */
const loadSettings = async () => {
    try {
        // Wait for mongoose connection if not connected yet to prevent buffering timeouts
        if (mongoose.connection.readyState !== 1) {
            console.log("⏳ [Settings] Database not connected yet. Waiting for connection before load...");
            await new Promise((resolve) => {
                mongoose.connection.once("connected", resolve);
            });
        }

        if (!isSynced) {
            await syncSettings(); // Run once at boot
            isSynced = true;

            // Automatically refresh in-memory settings cache every 10 seconds across all PM2 cluster workers
            setInterval(async () => {
                try {
                    if (mongoose.connection.readyState !== 1) return; // Skip if db disconnected
                    const settings = await Setting.find();
                    cachedSettings = settings.reduce((acc, s) => {
                        acc[s.key] = s.value;
                        return acc;
                    }, {});
                } catch (err) {
                    console.error("❌ Failed to refresh settings cache:", err.message);
                }
            }, 10000);
        }

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
