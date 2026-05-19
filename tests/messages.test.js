/**
 * tests/messages.test.js
 * 
 * Tests for chat/message endpoints:
 *  POST /api/chat/dm/:userId     — create/get DM conversation
 *  GET  /api/chat/:id/messages   — get messages (paginated)
 *  POST /api/chat/:id/messages   — send a message
 *
 * Auth: cookie-based JWT (req.cookies.token)
 * Two users are created per test: sender and receiver.
 */
const request = require('supertest');
const app = require('./helpers/testApp');
const { connectTestDB, clearDB, disconnectTestDB } = require('./helpers/dbHelper');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Register a user via ID card upload (no OTP needed).
 * Returns { cookies, userId }.
 */
async function createUser(suffix) {
    const res = await request(app)
        .post('/api/auth/register')
        .field('username', `user_${suffix}`)
        .field('password', 'TestPass123!')
        .field('fullName', `User ${suffix}`)
        .field('collegeName', 'Test University')
        .attach('idCardImage', Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64'
        ), { filename: 'id_card.png', contentType: 'image/png' });

    if (res.statusCode !== 201) {
        throw new Error(`createUser failed for ${suffix}: ${JSON.stringify(res.body)}`);
    }

    return {
        cookies: res.headers['set-cookie'],
        userId: res.body.user._id,
    };
}

/**
 * Create or get a DM conversation between two users.
 * Returns the conversation object.
 */
async function createDM(senderCookies, receiverId) {
    const res = await request(app)
        .post(`/api/chat/dm/${receiverId}`)
        .set('Cookie', senderCookies);

    if (res.statusCode !== 200 && res.statusCode !== 201) {
        throw new Error(`createDM failed: ${JSON.stringify(res.body)}`);
    }
    return res.body; // conversation object
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

describe('POST /api/chat/dm/:userId', () => {
    it('should create a DM conversation between two users (200/201)', async () => {
        const sender   = await createUser('sender1');
        const receiver = await createUser('recv1');

        const res = await request(app)
            .post(`/api/chat/dm/${receiver.userId}`)
            .set('Cookie', sender.cookies);

        expect([200, 201]).toContain(res.statusCode);
        expect(res.body).toHaveProperty('_id');
        expect(res.body).toHaveProperty('type', 'dm');
        expect(res.body.participants).toHaveLength(2);
    });

    it('should return the existing conversation if DM already exists', async () => {
        const sender   = await createUser('sender2');
        const receiver = await createUser('recv2');

        // Create once
        const first = await createDM(sender.cookies, receiver.userId);
        // Create again
        const res = await request(app)
            .post(`/api/chat/dm/${receiver.userId}`)
            .set('Cookie', sender.cookies);

        expect(res.statusCode).toBe(200);
        expect(res.body._id).toBe(first._id); // Same conversation returned
    });

    it('should return 401 without auth cookie', async () => {
        const res = await request(app)
            .post('/api/chat/dm/someuserid');

        expect(res.statusCode).toBe(401);
    });
});

describe('POST /api/chat/:id/messages', () => {
    let sender, receiver, conversation;

    beforeEach(async () => {
        sender      = await createUser('msgsender');
        receiver    = await createUser('msgrecv');
        conversation = await createDM(sender.cookies, receiver.userId);
    });

    it('should send a text message and return 201', async () => {
        const res = await request(app)
            .post(`/api/chat/${conversation._id}/messages`)
            .set('Cookie', sender.cookies)
            .field('text', 'Hello from test!');

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('_id');
        expect(res.body).toHaveProperty('text', 'Hello from test!');
        expect(res.body).toHaveProperty('conversation', conversation._id);
    });

    it('should return 400 if neither text nor media is provided', async () => {
        const res = await request(app)
            .post(`/api/chat/${conversation._id}/messages`)
            .set('Cookie', sender.cookies)
            .send({}); // Empty body

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('message');
    });

    it('should return 403 if user is not a participant', async () => {
        const outsider = await createUser('outsider');

        const res = await request(app)
            .post(`/api/chat/${conversation._id}/messages`)
            .set('Cookie', outsider.cookies)
            .field('text', 'Infiltrating!');

        expect(res.statusCode).toBe(403);
    });

    it('should return 401 without auth cookie', async () => {
        const res = await request(app)
            .post(`/api/chat/${conversation._id}/messages`)
            .send({ text: 'no auth' });

        expect(res.statusCode).toBe(401);
    });

    it('should send an image attachment and return 201', async () => {
        const res = await request(app)
            .post(`/api/chat/${conversation._id}/messages`)
            .set('Cookie', sender.cookies)
            .attach('media', Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                'base64'
            ), { filename: 'photo.png', contentType: 'image/png' });

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('mediaUrl');
        expect(res.body.mediaType).toBe('image');
    });
});

describe('GET /api/chat/:id/messages', () => {
    let sender, receiver, conversation;

    beforeEach(async () => {
        sender      = await createUser('getmsgsender');
        receiver    = await createUser('getmsgrecv');
        conversation = await createDM(sender.cookies, receiver.userId);

        // Seed 3 messages
        for (let i = 1; i <= 3; i++) {
            await request(app)
                .post(`/api/chat/${conversation._id}/messages`)
                .set('Cookie', sender.cookies)
                .field('text', `Message number ${i}`);
        }
    });

    it('should return paginated message list (200)', async () => {
        const res = await request(app)
            .get(`/api/chat/${conversation._id}/messages`)
            .set('Cookie', sender.cookies);

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(3);
    });

    it('should respect limit query param', async () => {
        const res = await request(app)
            .get(`/api/chat/${conversation._id}/messages?limit=2`)
            .set('Cookie', sender.cookies);

        expect(res.statusCode).toBe(200);
        expect(res.body.length).toBeLessThanOrEqual(2);
    });

    it('should return 401 without auth cookie', async () => {
        const res = await request(app)
            .get(`/api/chat/${conversation._id}/messages`);

        expect(res.statusCode).toBe(401);
    });

    it('should return messages in chronological order', async () => {
        const res = await request(app)
            .get(`/api/chat/${conversation._id}/messages`)
            .set('Cookie', sender.cookies);

        expect(res.statusCode).toBe(200);
        const times = res.body.map(m => new Date(m.createdAt).getTime());
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
        }
    });
});
