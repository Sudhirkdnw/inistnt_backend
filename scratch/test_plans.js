const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/social_mini';

async function run() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGO_URI);
    console.log('Database connected successfully.');

    // Import the controller
    const { getActivePlans } = require('../src/controllers/subscription.controller');

    // Create mock req and res objects
    const req = {};
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        console.log('\n--- RESPONSE RECEIVED ---');
        console.log('Status Code:', this.statusCode || 200);
        console.log('Data:', JSON.stringify(data, null, 2));
      }
    };

    console.log('Invoking getActivePlans controller...');
    await getActivePlans(req, res);

  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database.');
    process.exit(0);
  }
}

run();
