/**
 * Migration Script: Copy CampusConnectProfile data → User model
 *
 * Run ONCE before deploying the new backend code:
 *   node backend/src/scripts/migrateCCPhotosToUser.js
 *
 * What it does:
 *   - Copies photos, branch, semester, skills, interests, goals, bio
 *     from CampusConnectProfile → User (only if User field is empty)
 *   - Sets User.avatar = User.photos[0] if avatar is empty
 *   - Does NOT delete fields from CCProfile (Mongoose schema change handles that)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function migrate() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Use raw collection access to read old CC data before schema strips it
    const ccCollection = mongoose.connection.collection('campusconnectprofiles');
    const userCollection = mongoose.connection.collection('users');

    const allCC = await ccCollection.find({}).toArray();
    console.log(`📋 Found ${allCC.length} CampusConnect profiles to process\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const cc of allCC) {
        try {
            const userId = cc.user;
            const user = await userCollection.findOne({ _id: userId });

            if (!user) {
                console.log(`  ⚠️  User not found for CC profile ${cc._id}, skipping`);
                skipped++;
                continue;
            }

            const updates = {};

            // Migrate photos
            if ((!user.photos || user.photos.length === 0) && cc.photos && cc.photos.length > 0) {
                updates.photos = cc.photos;
                if (!user.avatar) {
                    updates.avatar = cc.photos[0];
                }
                console.log(`  📷 Migrating ${cc.photos.length} photos for user: ${user.username}`);
            }

            // Migrate branch
            if ((!user.branch || user.branch === '') && cc.branch && cc.branch !== '') {
                updates.branch = cc.branch;
            }

            // Migrate semester
            if (!user.semester && cc.semester) {
                updates.semester = cc.semester;
            }

            // Migrate skills
            if ((!user.skills || user.skills.length === 0) && cc.skills && cc.skills.length > 0) {
                updates.skills = cc.skills;
            }

            // Migrate interests
            if ((!user.interests || user.interests.length === 0) && cc.interests && cc.interests.length > 0) {
                updates.interests = cc.interests;
            }

            // Migrate goals
            if ((!user.goals || user.goals.length === 0) && cc.goals && cc.goals.length > 0) {
                updates.goals = cc.goals;
            }

            // Migrate bio
            if ((!user.bio || user.bio === '') && cc.bio && cc.bio !== '') {
                updates.bio = cc.bio;
            }

            if (Object.keys(updates).length > 0) {
                await userCollection.updateOne({ _id: userId }, { $set: updates });
                console.log(`  ✅ Migrated user: ${user.username} | fields: ${Object.keys(updates).join(', ')}`);
                migrated++;
            } else {
                skipped++;
            }
        } catch (err) {
            console.error(`  ❌ Error processing CC profile ${cc._id}:`, err.message);
            errors++;
        }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Skipped (no changes needed): ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log(`\n✅ Migration complete. You can now deploy the new backend code.`);

    await mongoose.disconnect();
    process.exit(errors > 0 ? 1 : 0);
}

migrate().catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
});
