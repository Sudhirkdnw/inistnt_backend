const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const User = require('../models/user.model');
const College = require('../models/college.model');
const University = require('../models/university.model');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({}).select('username collegeName collegeId university universityId branch department');
  console.log('Total users checked:', users.length);
  for (const u of users) {
    let changed = false;
    if (u.collegeName && /^[0-9a-fA-F]{24}$/.test(u.collegeName)) {
      const col = await College.findById(u.collegeName);
      if (col) {
        console.log(`User ${u.username} collegeName was ID, fixing to: ${col.name}`);
        u.collegeName = col.name;
        u.collegeId = col._id;
        changed = true;
      } else {
        const uni = await University.findById(u.collegeName);
        if (uni) {
          console.log(`User ${u.username} collegeName was Uni ID, fixing to: ${uni.name}`);
          u.collegeName = uni.name;
          u.universityId = uni._id;
          changed = true;
        }
      }
    }
    if (u.university && /^[0-9a-fA-F]{24}$/.test(u.university)) {
      const uni = await University.findById(u.university) || await College.findById(u.university);
      if (uni) {
        console.log(`User ${u.username} university was ID, fixing to: ${uni.name}`);
        u.university = uni.name;
        changed = true;
      }
    }
    if (changed) {
      await u.save();
    }
  }
  console.log('Finished checking/repairing user institution names.');
  process.exit(0);
}
check();
