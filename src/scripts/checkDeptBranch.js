const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require("../db/db");
const Department = require("../models/department.model");
const Branch = require("../models/branch.model");

async function check() {
    try {
        await connectDB();
        const deptCount = await Department.countDocuments();
        const branchCount = await Branch.countDocuments();
        console.log(`Departments in DB: ${deptCount}`);
        console.log(`Branches in DB: ${branchCount}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
