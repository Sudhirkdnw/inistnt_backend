/**
 * tests/helpers/globalSetup.js
 * Runs ONCE before all test suites.
 * Starts the MongoDB Memory Server and writes URI to a temp env var file
 * so individual test files can read it.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const path = require('path');
const fs = require('fs');

module.exports = async () => {
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    // Store instance so globalTeardown can stop it
    global.__MONGOD__ = mongod;
    process.env.MONGO_URI = uri;

    // Write uri to a tmp file so worker processes (--runInBand still) can read it
    const tmpFile = path.join(__dirname, '__mongo_uri__.tmp');
    fs.writeFileSync(tmpFile, uri);

    console.log('\n🧪 MongoDB Memory Server started');
};
