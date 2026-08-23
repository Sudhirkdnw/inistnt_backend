const path = require('path');
const dotenv = require('dotenv');
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require('../db/db');
const Community = require('../models/community.model');
const CommunityMember = require('../models/communityMember.model');
const Conversation = require('../models/conversation.model');
const User = require('../models/user.model');

async function testJoinLeave() {
  await connectDB();
  const testUser = await User.findOne();
  const comm = await Community.findOne({ slug: 'ai-ml-hub' });
  console.log('Testing with User:', testUser.username, 'on Community:', comm.name);

  // 1. Join
  let membership = await CommunityMember.findOne({ community: comm._id, user: testUser._id });
  if (!membership) {
    membership = await CommunityMember.create({
      community: comm._id,
      user: testUser._id,
      role: 'member',
      status: 'active'
    });
  }
  const countAfterJoin = await CommunityMember.countDocuments({ community: comm._id, status: 'active' });
  console.log('Joined successfully! Active members:', countAfterJoin);

  // 2. Verify Conversation participant
  await Conversation.findByIdAndUpdate(comm.conversation, { $addToSet: { participants: testUser._id } });
  const conv = await Conversation.findById(comm.conversation);
  console.log('Conversation participants count:', conv.participants.length);

  // 3. Clean up test membership
  await CommunityMember.findOneAndDelete({ community: comm._id, user: testUser._id });
  await Conversation.findByIdAndUpdate(comm.conversation, { $pull: { participants: testUser._id } });
  console.log('Test completed & cleaned up cleanly!');
  process.exit(0);
}

testJoinLeave();
