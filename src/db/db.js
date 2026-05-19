const mongoose = require('mongoose');
const InfrastructureLogger = require('../utils/infrastructureLogger');

const MONGO_URI = process.env.MONGO_URI;

function connectDB() {
    mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 50,
        retryWrites: true,
        w: 'majority',
    })
        .then(() => {
            InfrastructureLogger.database("SUCCESS", "MongoDB Atlas Connected successfully", { maxPoolSize: 50 });
        })
        .catch((err) => {
            InfrastructureLogger.database("CRITICAL", `MongoDB connection failed: ${err.message}`, {
                error: err.stack,
                suggestions: ["Atlas IP Whitelist", "Cluster not paused", "Correct URI in .env"]
            });
            // Retry after 5 seconds instead of crashing the process
            InfrastructureLogger.database("WARNING", "Retrying MongoDB connection in 5 seconds...");
            setTimeout(connectDB, 5000);
        });
}

module.exports = connectDB;