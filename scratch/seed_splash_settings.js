const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Setting = require('../src/models/settings.model');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("MONGO_URI not found in .env");
    process.exit(1);
}

mongoose.connect(MONGO_URI).then(async () => {
    const defaults = [
        { key: 'splash_day_url', value: '', category: 'Branding', description: 'URL for day splash screen image' },
        { key: 'splash_night_url', value: '', category: 'Branding', description: 'URL for night splash screen image' }
    ];

    for (const d of defaults) {
        await Setting.findOneAndUpdate(
            { key: d.key },
            { $setOnInsert: { value: d.value }, $set: { category: d.category, description: d.description } },
            { upsert: true, new: true }
        );
    }
    console.log("Seeded splash settings successfully!");
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
