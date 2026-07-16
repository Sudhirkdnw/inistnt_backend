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

// ── Campus Connect Preferences ONLY (profile data lives in User model) ────────
const campusConnectSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    // Why they're here — multi-select intents
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
    },
    // ── Discovery Filters (preferences — act as weights, not hard filters) ────
    preferredBranches: [{ type: String, trim: true }],
    preferredSemesters: [{ type: Number }],
    preferredSkills: [{ type: String, trim: true }],
    preferredInterests: [{ type: String, trim: true }],
    preferredCommunities: [{ type: String, trim: true }],
    // ── Visibility & Privacy ──────────────────────────────────────────────────
    verifiedOnly: {
        type: Boolean,
        default: false
    },
    allowConnectionRequests: {
        type: Boolean,
        default: true
    },
    allowMessagesAfterConnect: {
        type: Boolean,
        default: true
    },
    showOnlineStatus: {
        type: Boolean,
        default: true
    },
    hideFromSuggestions: {
        type: Boolean,
        default: false
    },
    // ── AI Recommendation Priority (ordered list of weight keys) ──────────────
    // Default order: skills > interests > goals > branch > semester > communities > mutuals
    aiPriorities: {
        type: [String],
        default: ["skills", "interests", "goals", "branch", "semester", "communities", "mutuals"],
        validate: {
            validator: function(arr) {
                const valid = ["skills", "interests", "goals", "branch", "semester", "communities", "mutuals"];
                return arr.every(k => valid.includes(k));
            },
            message: "Invalid AI priority key"
        }
    }
    // NOTE: branch, semester, skills, interests, goals, bio, photos
    // have been REMOVED — they now live exclusively in the User model.
}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────────────────────────
campusConnectSchema.index({ user: 1 }, { unique: true });
campusConnectSchema.index({ isActive: 1, intents: 1 });
campusConnectSchema.index({ mentorMode: 1 });
campusConnectSchema.index({ "teamListing.isLooking": 1 });

const CampusConnectProfile = mongoose.model("CampusConnectProfile", campusConnectSchema);

module.exports = { CampusConnectProfile, BRANCH_SKILLS };
