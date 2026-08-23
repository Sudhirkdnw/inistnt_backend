const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require("../db/db");
const Community = require("../models/community.model");
const Conversation = require("../models/conversation.model");
const User = require("../models/user.model");

const DEFAULT_COMMUNITIES = [
    {
        name: "AI & Machine Learning Hub",
        slug: "ai-ml-hub",
        shortDescription: "Explore LLMs, Neural Networks, Computer Vision & AI Research.",
        description: "A student community dedicated to Artificial Intelligence, Machine Learning, Deep Learning, and building cutting-edge AI projects. Join discussions, share papers, and collaborate on hackathon teams.",
        category: "AI & ML",
        icon: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=200&auto=format&fit=crop&q=80",
        coverPhoto: "https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&auto=format&fit=crop&q=80",
        rules: "1. Be respectful and collaborative.\n2. Share code and research with proper attribution.\n3. No spam or self-promotions without context.",
        isPinned: true,
        isFeatured: true,
        memberCount: 1240,
        status: "ACTIVE"
    },
    {
        name: "Competitive Coders & DSA",
        slug: "competitive-coders-dsa",
        shortDescription: "LeetCode daily challenges, algorithms, codeforces contests & interview prep.",
        description: "Ace your tech placement interviews and compete in global coding contests! We discuss dynamic programming, graphs, trees, and mock interview questions daily.",
        category: "Coding",
        icon: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=200&auto=format&fit=crop&q=80",
        coverPhoto: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80",
        rules: "1. Post LeetCode/Codeforces solutions with explanations.\n2. Help juniors debug logic politely.\n3. Discuss contest strategies constructively.",
        isPinned: true,
        isFeatured: true,
        memberCount: 980,
        status: "ACTIVE"
    },
    {
        name: "Campus Founders & Startups",
        slug: "campus-founders-startups",
        shortDescription: "Pitch startup ideas, find co-founders, and talk venture building.",
        description: "The official space for student entrepreneurs, builders, and innovators. Pitch your MVPs, get feedback from peers, find technical or marketing co-founders, and discuss funding rounds.",
        category: "Startups",
        icon: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=200&auto=format&fit=crop&q=80",
        coverPhoto: "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1200&auto=format&fit=crop&q=80",
        rules: "1. Constructive feedback only.\n2. Protect each other's intellectual property.\n3. Transparent collaboration.",
        isPinned: false,
        isFeatured: true,
        memberCount: 750,
        status: "ACTIVE"
    },
    {
        name: "Hackathon Warriors",
        slug: "hackathon-warriors",
        shortDescription: "Team formation, winning strategies, project demos & sprint hacks.",
        description: "Join teams for national and global hackathons like Smart India Hackathon, ETHIndia, MLH, and university hack nights. Build fast and ship impactful products.",
        category: "Hackathons",
        icon: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=200&auto=format&fit=crop&q=80",
        coverPhoto: "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&auto=format&fit=crop&q=80",
        rules: "1. Match with teammates based on skills.\n2. Practice open-source first approach.\n3. Celebrate each other's wins.",
        isPinned: false,
        isFeatured: true,
        memberCount: 1120,
        status: "ACTIVE"
    },
    {
        name: "Web3 & Blockchain Devs",
        slug: "web3-blockchain-devs",
        shortDescription: "Solidity, smart contracts, dApps, DeFi & decentralized tech.",
        description: "Explore Ethereum, Solana, zero-knowledge proofs, and decentralized systems. Connect with blockchain developers and build on-chain apps.",
        category: "Technology",
        icon: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=200&auto=format&fit=crop&q=80",
        coverPhoto: "https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=1200&auto=format&fit=crop&q=80",
        rules: "1. Strictly no financial advice or crypto shilling.\n2. Technical discussions and architecture only.",
        isPinned: false,
        isFeatured: false,
        memberCount: 640,
        status: "ACTIVE"
    },
    {
        name: "Game Development & Esports",
        slug: "gamedev-esports",
        shortDescription: "Unity, Unreal Engine 5, 3D modeling, game design & collegiate esports.",
        description: "From indie game creators to competitive collegiate gamers, this community brings together game designers, pixel artists, sound creators, and esports players.",
        category: "Gaming",
        icon: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=200&auto=format&fit=crop&q=80",
        coverPhoto: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&auto=format&fit=crop&q=80",
        rules: "1. Positive gaming culture.\n2. No toxic behavior or abuse.\n3. Share devlogs and gameplay highlights.",
        isPinned: false,
        isFeatured: false,
        memberCount: 890,
        status: "ACTIVE"
    }
];

async function seed() {
    try {
        await connectDB();
        console.log("Connected to database for community seed.");

        const admin = await User.findOne({ role: "admin" }) || await User.findOne();
        const adminId = admin ? admin._id : null;

        for (const item of DEFAULT_COMMUNITIES) {
            let existing = await Community.findOne({ slug: item.slug });
            if (!existing) {
                const comm = new Community({
                    ...item,
                    createdBy: adminId
                });
                await comm.save();

                const conv = await Conversation.create({
                    type: "community",
                    name: comm.name,
                    communityId: comm._id,
                    admin: adminId,
                    participants: adminId ? [adminId] : []
                });

                comm.conversation = conv._id;
                await comm.save();
                console.log(`✅ Seeded community: ${comm.name}`);
            } else {
                if (!existing.conversation) {
                    const conv = await Conversation.create({
                        type: "community",
                        name: existing.name,
                        communityId: existing._id,
                        admin: adminId,
                        participants: adminId ? [adminId] : []
                    });
                    existing.conversation = conv._id;
                    await existing.save();
                }
                console.log(`ℹ️ Community already exists: ${existing.name}`);
            }
        }

        console.log("🚀 Community seed completed successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }
}

seed();
