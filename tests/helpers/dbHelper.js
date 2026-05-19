/**
 * tests/helpers/dbHelper.js
 * Shared DB connect/disconnect/clean utilities for all test files.
 */
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

/**
 * Connect to the in-memory test DB.
 * Reads URI from globalSetup's tmp file.
 */
async function connectTestDB() {
    const tmpFile = path.join(__dirname, '__mongo_uri__.tmp');
    const uri = process.env.MONGO_URI || fs.readFileSync(tmpFile, 'utf8');
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri, { maxPoolSize: 5 });
    }
}

/**
 * Drop all collections (clean state between tests).
 */
async function clearDB() {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
}

/**
 * Disconnect from DB (called in afterAll).
 */
async function disconnectTestDB() {
    await mongoose.connection.close();
}

module.exports = { connectTestDB, clearDB, disconnectTestDB };
