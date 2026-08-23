const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require("../db/db");
const Community = require("../models/community.model");
const CommunityMember = require("../models/communityMember.model");
const Conversation = require("../models/conversation.model");
const User = require("../models/user.model");

async function syncRealMemberCounts() {
    try {
        await connectDB();
        console.log("Connected to database for community member count sync.");

        const communities = await Community.find({});
        console.log(`Found ${communities.length} communities.`);

        for (const comm of communities) {
            // If community has a creator, make sure they are in CommunityMember as owner
            if (comm.createdBy) {
                const existingOwner = await CommunityMember.findOne({
                    community: comm._id,
                    user: comm.createdBy
                });

                if (!existingOwner) {
                    await CommunityMember.create({
                        community: comm._id,
                        user: comm.createdBy,
                        role: "owner",
                        status: "active"
                    });
                    console.log(`Added creator ${comm.createdBy} as owner of "${comm.name}".`);
                }
            }

            // Count real active members
            const realCount = await CommunityMember.countDocuments({
                community: comm._id,
                status: "active"
            });

            comm.memberCount = realCount;
            await comm.save();

            console.log(`Community "${comm.name}" (${comm.slug}): Real Member Count = ${realCount}`);
        }

        console.log("Successfully synced all real community member counts!");
        process.exit(0);
    } catch (err) {
        console.error("Error syncing real member counts:", err);
        process.exit(1);
    }
}

syncRealMemberCounts();
