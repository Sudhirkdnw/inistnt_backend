const path = require('path');
const dotenv = require('dotenv');
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require('../db/db');
const Team = require('../models/team.model');
const Confession = require('../models/confession.model');

async function syncTeamFeedPosts() {
  try {
    await connectDB();
    console.log('Connected to DB. Checking team feed posts...');

    const teams = await Team.find({ status: { $in: ['ACTIVE', 'FULL'] } });
    console.log(`Found ${teams.length} teams in database.`);

    let syncedCount = 0;
    for (const team of teams) {
      // Check if a confession post exists for this team
      const existingPost = await Confession.findOne({
        $or: [
          { team: team._id },
          { _id: team.confessionPost }
        ]
      });

      if (!existingPost) {
        const skillsText = Array.isArray(team.skills) && team.skills.length > 0
          ? `\n\nSkills: ${team.skills.join(', ')}`
          : '';
        const feedText = `🚀 Looking for teammates: ${team.title}\n\n${team.purpose}${skillsText}`;

        const feedPost = await Confession.create({
          confessionText: feedText,
          category: 'other',
          user: team.owner,
          isAnonymous: false,
          postType: 'TEAM_RECRUITMENT',
          team: team._id,
          collegeName: team.collegeName || ''
        });

        team.confessionPost = feedPost._id;
        await team.save();
        syncedCount++;
        console.log(`Created feed post for team: "${team.title}" (Post ID: ${feedPost._id})`);
      } else {
        // Ensure postType is TEAM_RECRUITMENT and team ref is set
        if (existingPost.postType !== 'TEAM_RECRUITMENT' || !existingPost.team) {
          existingPost.postType = 'TEAM_RECRUITMENT';
          existingPost.team = team._id;
          await existingPost.save();
          console.log(`Updated postType for existing post of team: "${team.title}"`);
        }
      }
    }

    console.log(`Team feed sync completed! Created ${syncedCount} new feed posts.`);
    process.exit(0);
  } catch (err) {
    console.error('Error syncing team feed posts:', err);
    process.exit(1);
  }
}

syncTeamFeedPosts();
