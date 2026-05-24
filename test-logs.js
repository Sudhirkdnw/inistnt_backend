require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const InfrastructureLog = require("./src/models/infrastructureLog.model");
const User = require("./src/models/user.model");

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/social_mini")
  .then(async () => {
     try {
         const skip = 0;
         const limit = 30;
         const query = {};
         console.log("Connected to DB, running query...");
         const logs = await InfrastructureLog.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate("userId", "username email");
         console.log("Logs fetched:", logs.length);
         const total = await InfrastructureLog.countDocuments(query);
         console.log("Total:", total);
     } catch (e) {
         console.error("QUERY ERROR:", e.message);
     }
     process.exit(0);
  })
  .catch(e => {
     console.error("DB CONN ERROR:", e);
     process.exit(1);
  });
