/**
 * tests/helpers/globalTeardown.js
 * Runs ONCE after all test suites complete.
 */
const path = require('path');
const fs = require('fs');

module.exports = async () => {
    if (global.__MONGOD__) {
        await global.__MONGOD__.stop();
        console.log('\n🧪 MongoDB Memory Server stopped');
    }
    // Clean up temp file
    const tmpFile = path.join(__dirname, '__mongo_uri__.tmp');
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
};
