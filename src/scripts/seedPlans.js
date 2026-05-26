const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

// Load Environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/social_mini";

const subscriptionPlanModel = require("../models/subscriptionPlan.model");
const premiumSettingsModel = require("../models/premiumSettings.model");

async function seed() {
    try {
        console.log(`Connecting to MongoDB at: ${MONGO_URI}`);
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully!");

        // 1. Seed Premium plans
        console.log("Seeding premium subscription plans...");
        await subscriptionPlanModel.deleteMany({});
        
        const plans = [
            {
                name: "Weekly Premium",
                description: "Perfect for a quick campus match check",
                price: 49,
                billingPeriod: "weekly",
                discountPercentage: 0,
                freeTrialDays: 0,
                isActive: true
            },
            {
                name: "Monthly Gold",
                description: "Best seller! Full discovery and matches for 30 days",
                price: 199,
                billingPeriod: "monthly",
                discountPercentage: 25, // ₹149 discounted price
                freeTrialDays: 3,
                isActive: true
            },
            {
                name: "Yearly VIP",
                description: "Unlimited premium dating features all year round",
                price: 1599,
                billingPeriod: "yearly",
                discountPercentage: 40, // ₹959 discounted price
                freeTrialDays: 7,
                isActive: true
            }
        ];

        const insertedPlans = await subscriptionPlanModel.insertMany(plans);
        console.log("Successfully seeded Plans:", insertedPlans.map(p => p.name));

        // 2. Initialize global Settings
        console.log("Initializing premium system settings...");
        await premiumSettingsModel.deleteMany({});
        const settings = await premiumSettingsModel.create({
            isPremiumRequired: true
        });
        console.log("Global settings initialized:", settings);

        console.log("Seeding completed successfully! 🎉");
    } catch (err) {
        console.error("Seeding error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

seed();
