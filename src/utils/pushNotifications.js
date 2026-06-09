const axios = require('axios');
const userModel = require('../models/user.model');

/**
 * Send push notifications to a list of Expo push tokens
 * @param {string[]} pushTokens - Array of Expo push tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} [data] - Optional metadata payload
 */
async function sendPushNotification(pushTokens, title, body, data = {}, sound = 'default') {
    if (!pushTokens || !Array.isArray(pushTokens) || pushTokens.length === 0) {
        return;
    }

    // Filter valid Expo push tokens
    const validTokens = pushTokens.filter(token => typeof token === 'string' && (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken')));
    if (validTokens.length === 0) {
        return;
    }

    const messages = validTokens.map(token => ({
        to: token,
        sound: sound || undefined,
        title,
        body,
        data,
        channelId: 'default',
        priority: 'high'
    }));

    try {
        // Expo push notifications are sent in chunks
        // Axios POST requests directly to exp.host
        const response = await axios.post('https://exp.host/--/api/v2/push/send', messages, {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            }
        });

        if (response.data && response.data.data) {
            response.data.data.forEach((ticket, index) => {
                if (ticket.status === 'error') {
                    console.error(`[Expo Push Error] for token ${validTokens[index]}: ${ticket.message}`);
                }
            });
        }
    } catch (err) {
        console.error('[Expo Push Utility Exception]:', err.message);
    }
}

/**
 * Fetch a user's push tokens from database and send notifications
 * @param {string} userId - Recipient user ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} [data] - Optional metadata payload
 */
async function sendPushNotificationToUser(userId, title, body, data = {}) {
    try {
        const user = await userModel.findById(userId).select('pushTokens notificationSoundEnabled');
        if (user && user.pushTokens && user.pushTokens.length > 0) {
            const sound = user.notificationSoundEnabled !== false ? 'default' : null;
            await sendPushNotification(user.pushTokens, title, body, data, sound);
        }
    } catch (err) {
        console.error('[sendPushNotificationToUser Error]:', err);
    }
}

module.exports = {
    sendPushNotification,
    sendPushNotificationToUser
};
