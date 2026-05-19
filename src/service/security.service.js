const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

/**
 * Extracts security metadata from request
 * @param {import('express').Request} req 
 */
const getRequestMetadata = (req) => {
    // Extract IP handling proxies/load balancers
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
               req.socket.remoteAddress || 
               req.ip;
    
    // Normalize localhost for geoip
    const cleanIp = (ip === '::1' || ip === '127.0.0.1') ? '8.8.8.8' : ip; // Use Google DNS for testing geo in dev
    
    const geo = geoip.lookup(cleanIp) || {};
    const parser = new UAParser(req.headers['user-agent']);
    const ua = parser.getResult();

    return {
        ip: ip === '::1' ? '127.0.0.1' : ip,
        city: geo.city || 'Unknown',
        country: geo.country || 'Unknown',
        timezone: geo.timezone || 'UTC',
        browser: `${ua.browser.name || 'Unknown'} ${ua.browser.version || ''}`.trim(),
        os: `${ua.os.name || 'Unknown'} ${ua.os.version || ''}`.trim(),
        device: ua.device.type || 'desktop',
        userAgent: req.headers['user-agent']
    };
};

/**
 * Checks for suspicious activity based on history and new metadata
 * @param {Array} history 
 * @param {Object} metadata 
 */
const checkSuspicious = (history, metadata) => {
    if (!history || history.length === 0) return false;

    const lastSession = history[history.length - 1];
    
    // Alert if country changed suddenly
    if (lastSession.country !== metadata.country && metadata.country !== 'Unknown') {
        return true;
    }

    // Alert if device type changed (e.g. from mobile to desktop)
    if (lastSession.device !== metadata.device && history.length > 5) {
        return true;
    }

    return false;
};

module.exports = {
    getRequestMetadata,
    checkSuspicious
};
