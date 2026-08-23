const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require("../db/db");
const University = require("../models/university.model");
const College = require("../models/college.model");

async function check() {
    try {
        await connectDB();
        const uniCount = await University.countDocuments();
        const collegeCount = await College.countDocuments();
        console.log(`Universities in DB: ${uniCount}`);
        console.log(`Colleges in DB: ${collegeCount}`);

        const sampleUnis = await University.find().limit(5).lean();
        console.log("Sample Universities:", sampleUnis);

        const sampleColleges = await College.find().limit(5).lean();
        console.log("Sample Colleges:", sampleColleges);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
