/**
 * migrateUniversityToCollege.js
 * 
 * Safe one-time migration script:
 * For every user where `collegeName` is blank but `university` is set,
 * copy `university` value into `collegeName`.
 * 
 * Run: node src/scripts/migrateUniversityToCollege.js [--dry]
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/user.model");
const College = require("../models/college.model");

const DRY_RUN = process.argv.includes("--dry");

async function migrate() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    if (DRY_RUN) {
        console.log("🔍 DRY RUN MODE — no changes will be written\n");
    }

    // Step 1: Users with university set but collegeName empty
    const usersToMigrate = await User.find({
        university: { $nin: ["", null] },
        $or: [
            { collegeName: "" },
            { collegeName: null },
            { collegeName: { $exists: false } }
        ]
    }).select("_id username university universityId collegeName collegeId").lean();

    console.log(`Found ${usersToMigrate.length} users needing collegeName migration from university field.`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const u of usersToMigrate) {
        // Try to find a matching College document by name
        let collegeDoc = await College.findOne({
            name: new RegExp(`^${u.university.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            isActive: true
        }).lean();

        const update = {
            collegeName: u.university
        };

        if (collegeDoc) {
            update.collegeId = collegeDoc._id;
            console.log(`  → [${u.username}] '${u.university}' matched to College doc: ${collegeDoc._id}`);
        } else {
            console.log(`  → [${u.username}] '${u.university}' — no College doc found, copying name only`);
        }

        if (!DRY_RUN) {
            await User.updateOne({ _id: u._id }, { $set: update });
            migratedCount++;
        } else {
            skippedCount++;
        }
    }

    // Step 2: Users with both university and collegeName set — log for awareness
    const usersWithBoth = await User.countDocuments({
        university: { $nin: ["", null] },
        collegeName: { $nin: ["", null] }
    });
    console.log(`\n${usersWithBoth} users already have both university AND collegeName set (no action needed).`);

    if (DRY_RUN) {
        console.log(`\n🔍 DRY RUN complete — would have migrated ${skippedCount} users.`);
    } else {
        console.log(`\n✅ Migration complete — migrated ${migratedCount} users.`);
    }

    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
}

migrate().catch(err => {
    console.error("❌ Migration error:", err);
    process.exit(1);
});
