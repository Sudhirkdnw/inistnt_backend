const axios = require('axios');
const userModel = require('../models/user.model');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Sleep helper for retry delay
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if HTTP error is transient and safe to retry
 */
function isRetryableHttpError(err) {
  if (!err) return false;
  // Network timeouts or connection drops
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
    return true;
  }
  // Server-side errors or rate limit
  if (err.response && [429, 500, 502, 503, 504].includes(err.response.status)) {
    return true;
  }
  return false;
}

/**
 * Send a single chunk of messages with exponential backoff retry
 */
async function sendChunkWithRetry(chunk, chunkIndex) {
  const headers = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };

  if (process.env.EXPO_ACCESS_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const response = await axios.post(EXPO_PUSH_URL, chunk, {
        headers,
        timeout: REQUEST_TIMEOUT_MS,
      });

      return response.data;
    } catch (err) {
      lastError = err;
      const statusCode = err.response?.status;
      const isRetryable = isRetryableHttpError(err);

      if (isRetryable && attempt < MAX_RETRIES) {
        const delayMs = Math.pow(2, attempt) * 500 + Math.random() * 300; // Exponential backoff + jitter
        console.warn(
          `[Expo Push] Chunk ${chunkIndex} received HTTP ${statusCode || err.code}. Retrying attempt ${attempt}/${MAX_RETRIES} in ${Math.round(delayMs)}ms...`
        );
        await sleep(delayMs);
      } else {
        break;
      }
    }
  }

  console.error(
    `[Expo Push Chunk Exception] Chunk ${chunkIndex} permanently failed after ${attempt} attempts:`,
    lastError?.response?.status ? `HTTP ${lastError.response.status} (${lastError.message})` : lastError?.message
  );
  return null;
}

/**
 * Send push notifications to a list of Expo push tokens
 * @param {string[]} pushTokens - Array of Expo push tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} [data] - Optional metadata payload
 * @param {string} [sound] - Sound setting ('default' | null)
 */
async function sendPushNotification(pushTokens, title, body, data = {}, sound = 'default') {
  if (!pushTokens || !Array.isArray(pushTokens) || pushTokens.length === 0) {
    return 0;
  }

  // Filter valid Expo push tokens
  const validTokens = pushTokens.filter(
    (token) =>
      typeof token === 'string' &&
      (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken'))
  );

  if (validTokens.length === 0) {
    return 0;
  }

  const messages = validTokens.map((token) => {
    const rawImageUrl = data?.imageUrl || data?.image || data?.bannerUrl;
    const msg = {
      to: token,
      sound: sound || 'default',
      title,
      body,
      data: {
        ...data,
        image: rawImageUrl || undefined,
        imageUrl: rawImageUrl || undefined,
      },
      channelId: 'default',
      priority: 'high',
      _displayInForeground: true,
    };
    if (rawImageUrl) {
      msg.attachments = [{ url: rawImageUrl }];
      msg.richMedia = { image: rawImageUrl };
    }
    return msg;
  });

  if (messages.length > 0) {
    console.log(`[Expo Push Notification Dispatching] Sending ${messages.length} messages. Sample payload:`, JSON.stringify(messages[0], null, 2));
  }

  let successCount = 0;
  const deadTokens = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
    const chunk = messages.slice(i, i + CHUNK_SIZE);

    const result = await sendChunkWithRetry(chunk, chunkIndex);

    if (result && Array.isArray(result.data)) {
      result.data.forEach((ticket, idx) => {
        if (ticket.status === 'error') {
          console.warn(`[Expo Push Ticket Error] for token ${chunk[idx].to}:`, ticket.message, ticket.details?.error);
          // If token is invalid or unregistered on device, mark for removal
          if (ticket.details?.error === 'DeviceNotRegistered') {
            deadTokens.push(chunk[idx].to);
          }
        } else {
          successCount++;
        }
      });
    }
  }

  // Clean up dead tokens from database asynchronously if any detected
  if (deadTokens.length > 0) {
    userModel
      .updateMany(
        { pushTokens: { $in: deadTokens } },
        { $pull: { pushTokens: { $in: deadTokens } } }
      )
      .catch((e) => console.error('[Expo Push] Failed to clean up dead tokens:', e.message));
  }

  return successCount;
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
    if (user && Array.isArray(user.pushTokens) && user.pushTokens.length > 0) {
      const sound = user.notificationSoundEnabled !== false ? 'default' : null;
      await sendPushNotification(user.pushTokens, title, body, data, sound);
    }
  } catch (err) {
    console.error('[sendPushNotificationToUser Error]:', err.message);
  }
}

module.exports = {
  sendPushNotification,
  sendPushNotificationToUser,
};
