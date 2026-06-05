const request = require('supertest');
const app = require('./helpers/testApp');
const { connectTestDB, clearDB, disconnectTestDB } = require('./helpers/dbHelper');

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

beforeAll(async () => {
    await connectTestDB();
});

afterAll(async () => {
    await disconnectTestDB();
});

beforeEach(async () => {
    await clearDB();
});

describe('Confession Poll Feature Tests', () => {
    it('should create a confession with a poll', async () => {
        const user = await createUser('pollcreator');
        const res = await request(app)
            .post('/api/confessions')
            .set('Cookie', user.cookies)
            .send({
                confessionText: 'What is your favorite subject?',
                category: 'study',
                isAnonymous: false,
                pollOptions: ['Math', 'Science', 'History']
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.confession).toHaveProperty('poll');
        expect(res.body.confession.poll.options).toHaveLength(3);
        expect(res.body.confession.poll.options[0].text).toBe('Math');
        expect(res.body.confession.poll.options[0].votesCount).toBe(0);
        expect(res.body.confession.poll.options[0].votedByMe).toBe(false);
    });

    it('should reject a poll with less than 2 options', async () => {
        const user = await createUser('pollerr1');
        const res = await request(app)
            .post('/api/confessions')
            .set('Cookie', user.cookies)
            .send({
                confessionText: 'Too few choices',
                category: 'secret',
                pollOptions: ['Math']
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('at least 2 options');
    });

    it('should reject a poll if option text contains phone number', async () => {
        const user = await createUser('pollerr2');
        const res = await request(app)
            .post('/api/confessions')
            .set('Cookie', user.cookies)
            .send({
                confessionText: 'Call me for study help',
                category: 'study',
                pollOptions: ['Math', '9876543210']
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('Sharing phone numbers');
    });

    it('should vote and toggle vote on poll option', async () => {
        const creator = await createUser('creator');
        const voter = await createUser('voter');

        // Create confession with poll
        const createRes = await request(app)
            .post('/api/confessions')
            .set('Cookie', creator.cookies)
            .send({
                confessionText: 'Do you like Jest?',
                category: 'study',
                pollOptions: ['Yes', 'No']
            });

        const confessionId = createRes.body.confession._id;
        const yesOptionId = createRes.body.confession.poll.options[0]._id;
        const noOptionId = createRes.body.confession.poll.options[1]._id;

        // Cast vote for "Yes"
        const voteRes1 = await request(app)
            .post(`/api/confessions/${confessionId}/vote`)
            .set('Cookie', voter.cookies)
            .send({ optionId: yesOptionId });

        expect(voteRes1.statusCode).toBe(200);
        expect(voteRes1.body.confession.poll.options[0].votesCount).toBe(1);
        expect(voteRes1.body.confession.poll.options[0].votedByMe).toBe(true);

        // Toggle vote (unvote) by sending the same optionId again
        const voteRes2 = await request(app)
            .post(`/api/confessions/${confessionId}/vote`)
            .set('Cookie', voter.cookies)
            .send({ optionId: yesOptionId });

        expect(voteRes2.statusCode).toBe(200);
        expect(voteRes2.body.confession.poll.options[0].votesCount).toBe(0);
        expect(voteRes2.body.confession.poll.options[0].votedByMe).toBe(false);

        // Vote again for "Yes"
        await request(app)
            .post(`/api/confessions/${confessionId}/vote`)
            .set('Cookie', voter.cookies)
            .send({ optionId: yesOptionId });

        // Switch vote to "No"
        const voteRes3 = await request(app)
            .post(`/api/confessions/${confessionId}/vote`)
            .set('Cookie', voter.cookies)
            .send({ optionId: noOptionId });

        expect(voteRes3.statusCode).toBe(200);
        expect(voteRes3.body.confession.poll.options[0].votesCount).toBe(0); // yes should be 0
        expect(voteRes3.body.confession.poll.options[0].votedByMe).toBe(false);
        expect(voteRes3.body.confession.poll.options[1].votesCount).toBe(1); // no should be 1
        expect(voteRes3.body.confession.poll.options[1].votedByMe).toBe(true);
    });
});
