const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.resolve(process.cwd(), '.env');

/**
 * Reads allowed keys from .env
 */
function readMailEnv() {
    if (!fs.existsSync(ENV_PATH)) return {};

    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    const config = dotenv.parse(content);

    // Only return relevant keys for mail
    return {
        SMTP_HOST: config.SMTP_HOST || 'smtp.gmail.com',
        SMTP_PORT: config.SMTP_PORT || '587',
        SMTP_SECURE: config.SMTP_SECURE || 'false',
        EMAIL_USER: config.EMAIL_USER || '',
        EMAIL_PASS: config.EMAIL_PASS || '',
        EMAIL_FROM: config.EMAIL_FROM || '',
        EMAIL_FROM_NAME: config.EMAIL_FROM_NAME || 'Inistnt',
        RESEND_API_KEY: config.RESEND_API_KEY || ''
    };
}

/**
 * Updates specific keys in .env without corrupting other variables
 */
function updateMailEnv(newValues) {
    let content = '';
    if (fs.existsSync(ENV_PATH)) {
        content = fs.readFileSync(ENV_PATH, 'utf-8');
    }

    const lines = content.split('\n');
    const allowedKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM', 'EMAIL_FROM_NAME', 'RESEND_API_KEY'];

    const updatedKeys = new Set();
    const newLines = lines.map(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=/);
        if (match) {
            const key = match[1];
            if (allowedKeys.includes(key) && newValues[key] !== undefined) {
                updatedKeys.add(key);
                return `${key}=${newValues[key]}`;
            }
        }
        return line;
    });

    // Add missing keys
    allowedKeys.forEach(key => {
        if (!updatedKeys.has(key) && newValues[key] !== undefined) {
            newLines.push(`${key}=${newValues[key]}`);
        }
    });

    fs.writeFileSync(ENV_PATH, newLines.join('\n'), 'utf-8');

    // Dynamically update process.env for the current session
    Object.keys(newValues).forEach(key => {
        if (allowedKeys.includes(key)) {
            process.env[key] = newValues[key];
        }
    });
}

module.exports = { readMailEnv, updateMailEnv };
