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
            
            const db = mongoose.connection.db;

            // Drop capped infrastructurelogs collection to allow transition to TTL index
            db.listCollections({ name: 'infrastructurelogs' }).toArray()
                .then(cols => {
                    if (cols.length > 0 && cols[0].options && cols[0].options.capped) {
                        db.dropCollection('infrastructurelogs')
                            .then(() => {
                                console.log('🗑️ [Database] Dropped capped infrastructurelogs collection to allow TTL migration.');
                            })
                            .catch(err => console.error('Error dropping capped logs collection:', err));
                    }
                })
                .catch(err => console.error('Error checking collections:', err));

            // Drop old non-TTL indexes on auditlogs to allow TTL migration
            db.listCollections({ name: 'auditlogs' }).toArray()
                .then(cols => {
                    if (cols.length > 0) {
                        db.collection('auditlogs').listIndexes().toArray()
                            .then(indexes => {
                                const oldIndex = indexes.find(idx => idx.key && Object.keys(idx.key).length === 1 && idx.key.createdAt !== undefined && idx.expireAfterSeconds === undefined);
                                if (oldIndex) {
                                    db.collection('auditlogs').dropIndex(oldIndex.name)
                                        .then(() => {
                                            console.log(`🗑️ [Database] Dropped old non-TTL index ${oldIndex.name} on auditlogs.`);
                                        })
                                        .catch(err => console.error('Error dropping old index on auditlogs:', err));
                                }
                            })
                            .catch(err => console.error('Error listing indexes for auditlogs:', err));
                    }
                })
                .catch(err => console.error('Error checking auditlogs collection:', err));

            // Drop old non-TTL indexes on adminloginlogs to allow TTL migration
            db.listCollections({ name: 'adminloginlogs' }).toArray()
                .then(cols => {
                    if (cols.length > 0) {
                        db.collection('adminloginlogs').listIndexes().toArray()
                            .then(indexes => {
                                const oldIndex = indexes.find(idx => idx.key && Object.keys(idx.key).length === 1 && idx.key.createdAt !== undefined && idx.expireAfterSeconds === undefined);
                                if (oldIndex) {
                                    db.collection('adminloginlogs').dropIndex(oldIndex.name)
                                        .then(() => {
                                            console.log(`🗑️ [Database] Dropped old non-TTL index ${oldIndex.name} on adminloginlogs.`);
                                        })
                                        .catch(err => console.error('Error dropping old index on adminloginlogs:', err));
                                }
                            })
                            .catch(err => console.error('Error listing indexes for adminloginlogs:', err));
                    }
                })
                .catch(err => console.error('Error checking adminloginlogs collection:', err));
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