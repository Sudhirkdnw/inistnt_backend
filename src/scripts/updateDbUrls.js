const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const Setting = require('../models/settings.model');

async function updateUrls() {
    await mongoose.connect(process.env.MONGO_URI);
    await Setting.findOneAndUpdate(
        { key: 'admin_url' },
        { $set: { key: 'admin_url', value: 'https://adminfz.vercel.app', category: 'General', description: 'Production Admin Panel URL' } },
        { upsert: true }
    );
    await Setting.findOneAndUpdate(
        { key: 'backend_url' },
        { $set: { key: 'backend_url', value: 'https://api.hykee.in', category: 'General', description: 'Production Backend API URL' } },
        { upsert: true }
    );
    console.log('✅ Updated admin_url and backend_url in DB settings!');
    await mongoose.disconnect();
}

updateUrls().catch(err => {
    console.error(err);
    process.exit(1);
});
