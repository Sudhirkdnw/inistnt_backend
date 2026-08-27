const crypto = require("crypto");
const CampusAmbassador = require("../models/campusAmbassador.model");

/**
 * Clean a string to alphanumeric uppercase only (removing special characters/spaces)
 */
function sanitizeString(str) {
    if (!str) return "";
    return str.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Generates a unique referral code based on user data, or random clean string.
 * Format examples:
 * - HYKEE-SUDHIR
 * - SUDHIR47
 * - HYKEE-GAL-9821
 */
async function generateUniqueReferralCode(user, customPrefix = null) {
    const rawName = user?.username || user?.fullName || "AMB";
    const cleanName = sanitizeString(rawName).slice(0, 8) || "HYKEE";
    
    // Candidate formats to try sequentially
    const candidates = [
        `HYKEE-${cleanName}`,
        `${cleanName}${Math.floor(10 + Math.random() * 90)}`,
        `HYKEE-${cleanName}${Math.floor(10 + Math.random() * 90)}`,
        `${cleanName}${Math.floor(100 + Math.random() * 900)}`
    ];

    if (customPrefix) {
        const cleanPrefix = sanitizeString(customPrefix).slice(0, 10);
        candidates.unshift(`${cleanPrefix}-${cleanName}`);
    }

    for (const code of candidates) {
        const existing = await CampusAmbassador.findOne({ referralCode: code });
        if (!existing) {
            return code;
        }
    }

    // Fallback: Random 4-byte hex suffix
    let isUnique = false;
    let fallbackCode = "";
    let attempts = 0;

    while (!isUnique && attempts < 10) {
        const randSuffix = crypto.randomBytes(2).toString("hex").toUpperCase();
        fallbackCode = `HYKEE-${cleanName}-${randSuffix}`;
        const existing = await CampusAmbassador.findOne({ referralCode: fallbackCode });
        if (!existing) {
            isUnique = true;
        }
        attempts++;
    }

    if (!isUnique) {
        fallbackCode = `HYKEE-${Date.now().toString(36).toUpperCase()}`;
    }

    return fallbackCode;
}

module.exports = {
    generateUniqueReferralCode,
    sanitizeString
};
