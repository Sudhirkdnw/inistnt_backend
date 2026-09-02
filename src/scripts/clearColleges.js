const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require("../db/db");
const College = require("../models/college.model");
const University = require("../models/university.model");

async function clearColleges() {
    try {
        await connectDB();
        console.log("Connected to MongoDB database.");

        const initialColleges = await College.countDocuments({});
        const initialUnis = await University.countDocuments({});
        console.log(`Current colleges: ${initialColleges}, Universities: ${initialUnis}`);

        const collegeRes = await College.deleteMany({});
        const uniRes = await University.deleteMany({});
        console.log(`Deleted ${collegeRes.deletedCount} college records.`);
        console.log(`Deleted ${uniRes.deletedCount} university records.`);

        const remainingColleges = await College.countDocuments({});
        const remainingUnis = await University.countDocuments({});
        console.log(`Remaining colleges: ${remainingColleges}, Remaining universities: ${remainingUnis}`);

        console.log("Colleges & Universities collections successfully cleared!");
        process.exit(0);
    } catch (err) {
        console.error("Error clearing colleges:", err);
        process.exit(1);
    }
}

clearColleges();

