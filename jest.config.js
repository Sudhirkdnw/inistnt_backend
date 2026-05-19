/**
 * jest.config.js
 * 
 * --runInBand: run tests serially (required for shared in-memory DB)
 * testTimeout: bump to 30s for MongoDB Memory Server startup
 */
module.exports = {
    testEnvironment: 'node',
    testTimeout: 30000,
    verbose: true,
    // Only look in tests/ directory
    testMatch: ['**/tests/**/*.test.js'],
    // Prevent Jest from transforming node_modules (not needed for CJS)
    transformIgnorePatterns: ['/node_modules/'],
    // Global setup/teardown via helper shared across test suites
    globalSetup: './tests/helpers/globalSetup.js',
    globalTeardown: './tests/helpers/globalTeardown.js',
};
