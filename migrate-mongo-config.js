const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/social_mini";

let databaseName = "social_mini";
try {
    // Basic parse for database name from standard MongoDB connection URI
    const cleanUri = mongoUri.startsWith('mongodb+srv') 
        ? mongoUri.replace('mongodb+srv', 'http') 
        : mongoUri.replace('mongodb', 'http');
    const parsedUrl = new URL(cleanUri);
    databaseName = parsedUrl.pathname.replace(/^\//, '').split('?')[0] || "social_mini";
} catch (e) {
    // fallback
}

const config = {
  mongodb: {
    url: mongoUri,
    databaseName: databaseName,
    options: {}
  },
  migrationsDir: "migrations",
  changelogCollectionName: "changelog",
  lockCollectionName: "changelog_lock",
  lockTtl: 0,
  migrationFileExtension: ".js",
  useFileHash: false,
  moduleSystem: 'commonjs',
};

module.exports = config;
