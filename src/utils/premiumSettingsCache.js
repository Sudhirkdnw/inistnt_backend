const premiumSettingsModel = require("../models/premiumSettings.model");

let cachedSettings = null;
let lastFetched = 0;
const CACHE_TTL = 30000; // 30 seconds in milliseconds

async function getPremiumSettingsCached() {
    const now = Date.now();
    if (cachedSettings && (now - lastFetched < CACHE_TTL)) {
        return cachedSettings;
    }
    
    const settings = await premiumSettingsModel.findOne().lean();
    cachedSettings = settings || { isPremiumRequired: true, showMockGateway: true, activeGateway: "mock" };
    lastFetched = now;
    return cachedSettings;
}

function invalidatePremiumSettingsCache() {
    cachedSettings = null;
    lastFetched = 0;
}

module.exports = { getPremiumSettingsCached, invalidatePremiumSettingsCache };
