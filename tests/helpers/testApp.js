/**
 * tests/helpers/testApp.js
 * 
 * Returns the Express app configured for testing.
 * - Does NOT call server.listen() (supertest handles binding)
 * - Does NOT connect to Redis or Socket.IO (not needed for API tests)
 * - Uses the same Express app and all routes as production
 */
require('dotenv').config();

// Override env before any module loads
process.env.NODE_ENV = 'test';
// Disable Redis in tests (avoids ioredis connection attempts)
delete process.env.REDIS_URL;
// JWT_SECRET fallback for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_jest';

const app = require('../../src/app');

module.exports = app;
