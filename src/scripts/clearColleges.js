const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require("../db/db");
const College = require("../models/college.model");

async function clearColleges() {
    try {
        await connectDB();
        console.log("Connected to MongoDB database.");

        const initialCount = await College.countDocuments({});
        console.log(`Current colleges in database: ${initialCount}`);

        const result = await College.deleteMany({});
        console.log(`Deleted ${result.deletedCount} college records.`);

        const remainingCount = await College.countDocuments({});
        console.log(`Remaining colleges in database: ${remainingCount}`);

        console.log("Colleges collection successfully cleared!");
        process.exit(0);
    } catch (err) {
        console.error("Error clearing colleges:", err);
        process.exit(1);
    }
}

clearColleges();
