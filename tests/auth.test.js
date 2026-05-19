/**
 * tests/auth.test.js
 * 
 * Tests for:
 *  POST /api/auth/register
 *  POST /api/auth/login
 *  GET  /api/auth/me  (requires cookie-based JWT)
 *
 * NOTE: This app uses cookie-based auth (not Bearer header).
 *       The authMiddleware reads req.cookies.token.
 *       Supertest sends cookies via .set('Cookie', ...)
 */
const request = require('supertest');
const app = require('./helpers/testApp');
const { connectTestDB, clearDB, disconnectTestDB } = require('./helpers/dbHelper');

// ── Shared test user data ────────────────────────────────────────────────────
const TEST_USER = {
    username: 'testuser_auth',
    password: 'TestPass123!',
    email: 'testuser@example.com',
    fullName: 'Test User',
    collegeName: 'Test University',
    // Using ID card path (no college email OTP required)
};

// Helper: register a user and return the cookie + user body
async function registerAndGetCookie() {
    const res = await request(app)
        .post('/api/auth/register')
        .field('username', TEST_USER.username)
        .field('password', TEST_USER.password)
        .field('fullName', TEST_USER.fullName)
        .field('collegeName', TEST_USER.collegeName)
        // Attach a fake ID card image (1x1 PNG buffer)
        .attach('idCardImage', Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64'
        ), { filename: 'id_card.png', contentType: 'image/png' });

    // Extract Set-Cookie header
    const cookies = res.headers['set-cookie'];
    return { res, cookies };
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
    await connectTestDB();
});

afterAll(async () => {
    await disconnectTestDB();
});

beforeEach(async () => {
    await clearDB();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
    it('should register a new user and return 201', async () => {
        const { res } = await registerAndGetCookie();

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('username', TEST_USER.username);
        expect(res.body.user).not.toHaveProperty('password');
    });

    it('should return 400 if username is missing', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .field('password', 'somepass')
            .field('collegeName', 'Some College')
            .attach('idCardImage', Buffer.from('fake'), {
                filename: 'id.png', contentType: 'image/png'
            });

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('message');
    });

    it('should return 400 if no college verification provided', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'noverify',
                password: 'pass123',
                collegeName: 'Test College',
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/college email or upload/i);
    });

    it('should return 409 if username already exists (duplicate)', async () => {
        // Register once
        await registerAndGetCookie();

        // Register again with same username
        const res = await request(app)
            .post('/api/auth/register')
            .field('username', TEST_USER.username)
            .field('password', 'AnotherPass!')
            .field('collegeName', 'Other College')
            .attach('idCardImage', Buffer.from('fake'), {
                filename: 'id.png', contentType: 'image/png'
            });

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toMatch(/already exists/i);
    });
});

describe('POST /api/auth/login', () => {
    beforeEach(async () => {
        // Pre-create a user to login with
        await registerAndGetCookie();
    });

    it('should login successfully and return 200 with user data', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: TEST_USER.username,
                password: TEST_USER.password,
            });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('message', 'Login successful');
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('username', TEST_USER.username);
        // Cookie should be set
        expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should return 401 for wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: TEST_USER.username,
                password: 'WrongPassword!',
            });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toMatch(/invalid credentials/i);
    });

    it('should return 404 for non-existent username', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'ghost_user_99',
                password: 'anything',
            });

        expect(res.statusCode).toBe(404);
    });

    it('should return 400 if username or password missing', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: TEST_USER.username }); // missing password

        expect(res.statusCode).toBe(400);
    });
});

describe('GET /api/auth/me', () => {
    let authCookie;

    beforeEach(async () => {
        const { cookies } = await registerAndGetCookie();
        authCookie = cookies;
    });

    it('should return current user when authenticated (200)', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', authCookie);

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('username', TEST_USER.username);
        expect(res.body.user).not.toHaveProperty('password');
    });

    it('should return 401 when no token provided', async () => {
        const res = await request(app)
            .get('/api/auth/me');
        // No cookie set

        expect(res.statusCode).toBe(401);
    });

    it('should return 401 for invalid/tampered token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', ['token=invalid.token.here']);

        expect(res.statusCode).toBe(401);
    });
});
