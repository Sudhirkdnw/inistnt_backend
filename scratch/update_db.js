const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const EmailTemplate = require('../src/models/emailTemplate.model');
    await EmailTemplate.updateOne(
        { name: 'password_reset' },
        { $set: { content: '<h1>Security Alert</h1><p>Click <a href="{{url}}" clicktracking="off">here</a> to reset.</p><p>Or copy and paste this link: {{url}}</p>' } }
    );
    console.log('Template updated successfully!');
    process.exit(0);
});
