const mongoose = require('mongoose');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Find all settings
    const settings = await mongoose.connection.db.collection('settings').find({}).toArray();
    console.log('Settings in DB:', settings.map(s => ({
      _id: s._id,
      key: s.key,
      value: s.value
    })));

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
