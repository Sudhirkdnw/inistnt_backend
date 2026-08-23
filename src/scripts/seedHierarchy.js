const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require("../db/db");
const Department = require("../models/department.model");
const Branch = require("../models/branch.model");
const College = require("../models/college.model");
const University = require("../models/university.model");

const DEPARTMENTS = [
    { name: "Computer Science & Engineering", code: "CSE" },
    { name: "Information Technology", code: "IT" },
    { name: "Artificial Intelligence & Data Science", code: "AI&DS" },
    { name: "Electronics & Communication Engineering", code: "ECE" },
    { name: "Electrical & Electronics Engineering", code: "EEE" },
    { name: "Mechanical Engineering", code: "ME" },
    { name: "Civil Engineering", code: "CE" },
    { name: "Management & Business Studies", code: "MBA/BBA" },
    { name: "Computer Applications", code: "BCA/MCA" },
    { name: "Commerce & Finance", code: "COMMERCE" },
    { name: "Science & Mathematics", code: "SCIENCE" },
    { name: "Pharmacy & Medical Sciences", code: "PHARMACY" },
    { name: "Humanities & Social Sciences", code: "HUMANITIES" },
    { name: "Law & Legal Studies", code: "LAW" },
    { name: "Design & Architecture", code: "DESIGN" }
];

const BRANCHES = [
    { name: "B.Tech Computer Science & Engineering", degree: "B.Tech" },
    { name: "B.Tech Artificial Intelligence & Machine Learning", degree: "B.Tech" },
    { name: "B.Tech Data Science", degree: "B.Tech" },
    { name: "B.Tech Cyber Security", degree: "B.Tech" },
    { name: "B.Tech Information Technology", degree: "B.Tech" },
    { name: "B.Tech Electronics & Communication", degree: "B.Tech" },
    { name: "B.Tech Electrical Engineering", degree: "B.Tech" },
    { name: "B.Tech Mechanical Engineering", degree: "B.Tech" },
    { name: "B.Tech Civil Engineering", degree: "B.Tech" },
    { name: "Bachelor of Computer Applications (BCA)", degree: "BCA" },
    { name: "Master of Computer Applications (MCA)", degree: "MCA" },
    { name: "Bachelor of Business Administration (BBA)", degree: "BBA" },
    { name: "Master of Business Administration (MBA)", degree: "MBA" },
    { name: "Bachelor of Commerce (B.Com Hons)", degree: "B.Com" },
    { name: "Bachelor of Science (B.Sc)", degree: "B.Sc" },
    { name: "Bachelor of Pharmacy (B.Pharm)", degree: "B.Pharm" },
    { name: "Bachelor of Arts (BA)", degree: "BA" },
    { name: "B.A. LL.B. / LL.B.", degree: "Law" }
];

async function seed() {
    try {
        await connectDB();
        console.log("Connected to MongoDB for Hierarchy Seed.");

        // 1. Seed Departments
        for (const dept of DEPARTMENTS) {
            await Department.findOneAndUpdate(
                { name: dept.name },
                { $set: { code: dept.code, isActive: true } },
                { upsert: true, returnDocument: 'after' }
            );
        }
        console.log(`✅ Seeded ${DEPARTMENTS.length} standard departments.`);

        // 2. Seed Branches
        for (const branch of BRANCHES) {
            await Branch.findOneAndUpdate(
                { name: branch.name },
                { $set: { degree: branch.degree, isActive: true } },
                { upsert: true, returnDocument: 'after' }
            );
        }
        console.log(`✅ Seeded ${BRANCHES.length} standard branches.`);

        console.log("🚀 Hierarchy seeding completed successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Hierarchy seed failed:", err);
        process.exit(1);
    }
}

seed();
