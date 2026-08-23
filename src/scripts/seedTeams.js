const path = require('path');
const dotenv = require('dotenv');
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require('../db/db');
const Team = require('../models/team.model');
const TeamMember = require('../models/teamMember.model');
const Conversation = require('../models/conversation.model');
const Confession = require('../models/confession.model');
const User = require('../models/user.model');

const SAMPLE_TEAMS = [
  {
    title: 'Need 2 Full Stack Developers for Smart India Hackathon (SIH)',
    purpose: 'We are building an AI-powered automated smart attendance & campus navigation system for SIH 2026. Looking for 2 developers with experience in React/React Native, Node.js, and FastAPI.',
    category: 'Hackathon',
    skills: ['React Native', 'Node.js', 'FastAPI', 'MongoDB', 'Python'],
    maxMembers: 6,
    genderPreference: 'ANY',
    collegeScope: 'ALL_COLLEGES'
  },
  {
    title: 'Building an AI Agent Workflow Automation Startup',
    purpose: 'Pre-seed student startup building autonomous agent workflows for campus businesses and educational institutions. Looking for passionate backend and ML engineers.',
    category: 'Startup',
    skills: ['Python', 'PyTorch', 'LLMs', 'Docker', 'PostgreSQL'],
    maxMembers: 4,
    genderPreference: 'ANY',
    collegeScope: 'ALL_COLLEGES'
  },
  {
    title: 'Competitive Coding & ICPC Regional Team',
    purpose: 'Looking for 2 dedicated programmers aiming for Codeforces Candidate Master and ICPC Regionals. Daily practice, virtual contests, and graph/DP problem solving.',
    category: 'Competition',
    skills: ['C++', 'Algorithms', 'Data Structures', 'Competitive Programming'],
    maxMembers: 3,
    genderPreference: 'ANY',
    collegeScope: 'SAME_COLLEGE'
  },
  {
    title: 'Final Year Major Project: Autonomous Drone Object Detection',
    purpose: 'Working on a Major Capstone Project utilizing computer vision for real-time search and rescue operations via drone camera feeds.',
    category: 'Project',
    skills: ['Computer Vision', 'YOLOv8', 'OpenCV', 'Embedded Systems', 'ROS'],
    maxMembers: 4,
    genderPreference: 'ANY',
    collegeScope: 'SAME_COLLEGE'
  },
  {
    title: 'Inter-College Esports Valorant Tournament Lineup',
    purpose: 'Recruiting an Ascendant+ rank Duelist / Initiator for upcoming Inter-College Esports Championship 2026.',
    category: 'Sports',
    skills: ['Valorant', 'Esports', 'Team Communication', 'Strategy'],
    maxMembers: 5,
    genderPreference: 'ANY',
    collegeScope: 'ALL_COLLEGES'
  }
];

async function seedTeams() {
  try {
    await connectDB();
    console.log('Connected to DB. Starting team seeding...');

    const user = await User.findOne({ isBanned: false });
    if (!user) {
      console.log('No user found to assign as team owner.');
      process.exit(1);
    }

    console.log(`Using owner user: ${user.fullName || user.username} (${user._id})`);

    for (const data of SAMPLE_TEAMS) {
      const existing = await Team.findOne({ title: data.title });
      if (existing) {
        console.log(`Team already exists: ${data.title}`);
        continue;
      }

      // 1. Create Team
      const team = await Team.create({
        ...data,
        owner: user._id,
        currentMemberCount: 1,
        collegeName: user.collegeName || 'Campus University',
        collegeId: user.collegeId || null,
        status: 'ACTIVE'
      });

      // 2. Add owner to TeamMember
      await TeamMember.create({
        team: team._id,
        user: user._id,
        role: 'OWNER',
        status: 'ACTIVE'
      });

      // 3. Create Team Conversation
      const conversation = await Conversation.create({
        type: 'team',
        teamId: team._id,
        name: `${team.title} (Team)`,
        admin: user._id,
        participants: [user._id]
      });

      // 4. Create Home Feed Post
      const feedPost = await Confession.create({
        confessionText: `🚀 Looking for teammates: ${team.title}\n\n${team.purpose}\n\nSkills: ${team.skills.join(', ')}`,
        category: 'other',
        user: user._id,
        isAnonymous: false,
        postType: 'TEAM_RECRUITMENT',
        team: team._id,
        collegeName: team.collegeName
      });

      team.conversation = conversation._id;
      team.confessionPost = feedPost._id;
      await team.save();

      console.log(`Created team: ${team.title} (ID: ${team._id})`);
    }

    console.log('Team seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seed teams error:', err);
    process.exit(1);
  }
}

seedTeams();
