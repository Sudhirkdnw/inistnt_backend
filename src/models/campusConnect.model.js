const mongoose = require("mongoose");

const BRANCH_SKILLS = {
    "Computer Science": ["React", "Node.js", "Python", "Java", "Flutter", "AI", "Machine Learning", "Cyber Security", "Cloud", "DevOps", "DSA", "Open Source", "Competitive Programming"],
    "AIML": ["Python", "Deep Learning", "TensorFlow", "LLMs", "Computer Vision", "NLP", "Data Science"],
    "Commerce": ["Finance", "Accounting", "Marketing", "Business Analytics", "Excel", "Investment", "Consulting"],
    "Mechanical": ["AutoCAD", "SolidWorks", "CATIA", "ANSYS", "Manufacturing", "Design"],
    "Civil": ["AutoCAD", "Structural Design", "Surveying", "Construction"],
    "Medical": ["Research", "Clinical Practice", "Physiology", "Anatomy", "Healthcare"],
    "Electronics": ["Arduino", "Raspberry Pi", "VLSI", "Embedded Systems", "IoT", "PCB Design"],
    "Electrical": ["Power Systems", "MATLAB", "AutoCAD Electrical", "PLC", "Circuit Design"],
    "Information Technology": ["Networking", "Database", "Web Dev", "Cybersecurity", "Cloud Computing"],
    "BBA": ["Management", "Marketing", "Finance", "HR", "Entrepreneurship"],
    "MBA": ["Strategy", "Operations", "Leadership", "Finance", "Analytics"],
    "Law": ["Corporate Law", "Criminal Law", "Constitutional Law", "Research", "Moot Court"],
    "Architecture": ["AutoCAD", "Revit", "SketchUp", "Urban Planning", "Interior Design"],
    "Other": ["Leadership", "Communication", "Research", "Writing", "Public Speaking"]
};

const campusConnectSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    // Why they're here — multi-select
    intents: [{
        type: String,
        enum: [
            "friends", "study_partner", "coding_buddy", "startup_cofounder",
            "gaming_friend", "sports_partner", "creative_partner", "music_buddy",
            "photography", "relationship", "networking", "mentorship"
        ]
    }],
    // College location filter
    locationFilter: {
        type: String,
        enum: ["my_college", "nearby_colleges", "all"],
        default: "my_college"
    },
    // Academic profile
    branch: {
        type: String,
        trim: true,
        default: ""
    },
    semester: {
        type: Number,
        min: 1,
        max: 12,
        default: null
    },
    // Skills based on branch + custom
    skills: [{
        type: String,
        trim: true
    }],
    // Interests (general lifestyle)
    interests: [{
        type: String,
        trim: true
    }],
    // Goals
    goals: [{
        type: String,
        enum: [
            "internship", "placement", "freelancing", "research",
            "higher_studies", "startup", "networking", "competitive_exams",
            "content_creation"
        ]
    }],
    // Bio
    bio: {
        type: String,
        maxlength: 400,
        default: ""
    },
    // Photos
    photos: [{ type: String }],
    // Active in discovery
    isActive: {
        type: Boolean,
        default: true
    },
    // Mentor mode
    mentorMode: {
        type: Boolean,
        default: false
    },
    mentorTags: [{
        type: String,
        enum: ["placement", "career", "coding", "higher_studies", "startup", "research"]
    }],
    // Team listing
    teamListing: {
        isLooking: { type: Boolean, default: false },
        role: { type: String, default: "" },
        description: { type: String, maxlength: 300, default: "" },
        skills: [{ type: String }]
    },
    // Onboarding completed
    onboardingDone: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// ── Indexes ─────────────────────────────────────────────
campusConnectSchema.index({ user: 1 }, { unique: true });
campusConnectSchema.index({ isActive: 1, branch: 1 });
campusConnectSchema.index({ isActive: 1, intents: 1 });
campusConnectSchema.index({ mentorMode: 1 });
campusConnectSchema.index({ "teamListing.isLooking": 1 });
campusConnectSchema.index({ skills: 1 });
campusConnectSchema.index({ goals: 1 });

const CampusConnectProfile = mongoose.model("CampusConnectProfile", campusConnectSchema);

module.exports = { CampusConnectProfile, BRANCH_SKILLS };
