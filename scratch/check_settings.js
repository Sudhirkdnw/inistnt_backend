const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const premiumSettingsModel = require('../src/models/premiumSettings.model');
    const settings = await premiumSettingsModel.findOne().lean();
    console.log('--- Current Premium Settings ---');
    console.log(JSON.stringify(settings, null, 2));
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
