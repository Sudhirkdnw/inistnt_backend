const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function scanAndReplace() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const collections = await mongoose.connection.db.listCollections().toArray();
    for (const col of collections) {
        const cursor = mongoose.connection.db.collection(col.name).find({});
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const str = JSON.stringify(doc);
            if (str.includes('netlify.app')) {
                console.log(`Found netlify in collection "${col.name}", doc ID: ${doc._id}`);
                const updatedStr = str.replaceAll('adminfz.netlify.app', 'adminfz.vercel.app').replaceAll('https://adminfz.netlify.app', 'https://adminfz.vercel.app').replaceAll('http://adminfz.netlify.app', 'https://adminfz.vercel.app');
                const updatedDoc = JSON.parse(updatedStr);
                delete updatedDoc._id;
                await mongoose.connection.db.collection(col.name).updateOne(
                    { _id: doc._id },
                    { $set: updatedDoc }
                );
                console.log(`✅ Cleaned doc ID ${doc._id} in collection "${col.name}"`);
            }
        }
    }
    console.log('🎉 Scan and replace complete across all MongoDB collections!');
    await mongoose.disconnect();
}

scanAndReplace().catch(err => {
    console.error(err);
    process.exit(1);
});
