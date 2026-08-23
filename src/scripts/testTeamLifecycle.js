const path = require('path');
const dotenv = require('dotenv');
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require('../db/db');
const Team = require('../models/team.model');
const TeamMember = require('../models/teamMember.model');
const TeamApplication = require('../models/teamApplication.model');
const Conversation = require('../models/conversation.model');
const User = require('../models/user.model');

async function testTeamLifecycle() {
  try {
    await connectDB();
    console.log('--- STARTING TEAM FINDER END-TO-END TEST ---');

    const users = await User.find({ isBanned: false }).limit(3);
    if (users.length < 2) {
      console.log('Need at least 2 users in DB to run test.');
      process.exit(1);
    }

    const owner = users[0];
    const applicant = users[1];

    console.log(`Team Owner: ${owner.fullName || owner.username} (${owner._id})`);
    console.log(`Applicant: ${applicant.fullName || applicant.username} (${applicant._id})`);

    // 1. Create a test team
    const teamTitle = `Test Hackathon Team ${Date.now()}`;
    const team = await Team.create({
      title: teamTitle,
      purpose: 'Building an AI project for regional hackathon.',
      category: 'Hackathon',
      skills: ['React', 'Node.js', 'Python'],
      owner: owner._id,
      currentMemberCount: 1,
      maxMembers: 3,
      genderPreference: 'ANY',
      collegeScope: 'ALL_COLLEGES',
      collegeName: owner.collegeName || 'Test University',
      status: 'ACTIVE'
    });

    await TeamMember.create({
      team: team._id,
      user: owner._id,
      role: 'OWNER',
      status: 'ACTIVE'
    });

    const conversation = await Conversation.create({
      type: 'team',
      teamId: team._id,
      name: `${team.title} (Team)`,
      admin: owner._id,
      participants: [owner._id]
    });

    team.conversation = conversation._id;
    await team.save();

    console.log(`✓ 1. Created team with conversation: ${team._id}`);

    // 2. Submit application
    const application = await TeamApplication.create({
      team: team._id,
      applicant: applicant._id,
      message: 'I have 2 years of React experience and want to join!',
      skills: ['React', 'Node.js'],
      status: 'PENDING'
    });

    console.log(`✓ 2. Applicant submitted application: ${application._id}`);

    // 3. Verify owner sees pending application
    const pendingApps = await TeamApplication.find({ team: team._id, status: 'PENDING' });
    if (pendingApps.length !== 1) throw new Error('Pending application count mismatch');
    console.log(`✓ 3. Owner retrieved pending applications count: ${pendingApps.length}`);

    // 4. Owner accepts application
    application.status = 'ACCEPTED';
    application.reviewedAt = new Date();
    application.reviewedBy = owner._id;
    await application.save();

    await TeamMember.create({
      team: team._id,
      user: applicant._id,
      role: 'MEMBER',
      status: 'ACTIVE'
    });

    const memberCount = await TeamMember.countDocuments({ team: team._id, status: 'ACTIVE' });
    team.currentMemberCount = memberCount;
    await team.save();

    await Conversation.findByIdAndUpdate(team.conversation, {
      $addToSet: { participants: applicant._id }
    });

    console.log(`✓ 4. Owner accepted application. Updated member count: ${team.currentMemberCount}/${team.maxMembers}`);

    // 5. Verify conversation participants
    const updatedConv = await Conversation.findById(team.conversation);
    if (!updatedConv.participants.some(p => String(p) === String(applicant._id))) {
      throw new Error('Applicant was not added to conversation participants');
    }
    console.log(`✓ 5. Applicant successfully added to Team Group Chat! Total participants: ${updatedConv.participants.length}`);

    // Clean up test data
    await TeamApplication.deleteMany({ team: team._id });
    await TeamMember.deleteMany({ team: team._id });
    await Conversation.findByIdAndDelete(team.conversation);
    await Team.findByIdAndDelete(team._id);

    console.log('✓ 6. Test team cleaned up.');
    console.log('--- ALL TEAM FINDER TESTS PASSED CLEANLY! ---');
    process.exit(0);
  } catch (err) {
    console.error('Test lifecycle error:', err);
    process.exit(1);
  }
}

testTeamLifecycle();
