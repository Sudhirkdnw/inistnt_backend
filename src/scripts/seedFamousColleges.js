const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require("../db/db");
const College = require("../models/college.model");
const University = require("../models/university.model");

const FAMOUS_COLLEGES = [
    // ── Premier Tech & Engineering ──
    { name: "Indian Institute of Technology Bombay (IITB)", code: "IITB", city: "Mumbai", state: "Maharashtra" },
    { name: "Indian Institute of Technology Delhi (IITD)", code: "IITD", city: "New Delhi", state: "Delhi" },
    { name: "Indian Institute of Technology Madras (IITM)", code: "IITM", city: "Chennai", state: "Tamil Nadu" },
    { name: "Indian Institute of Technology Kanpur (IITK)", code: "IITK", city: "Kanpur", state: "Uttar Pradesh" },
    { name: "Indian Institute of Technology Kharagpur (IITKGP)", code: "IITKGP", city: "Kharagpur", state: "West Bengal" },
    { name: "Indian Institute of Technology Roorkee (IITR)", code: "IITR", city: "Roorkee", state: "Uttarakhand" },
    { name: "Indian Institute of Technology Guwahati (IITG)", code: "IITG", city: "Guwahati", state: "Assam" },
    { name: "Indian Institute of Technology Hyderabad (IITH)", code: "IITH", city: "Hyderabad", state: "Telangana" },
    { name: "Indian Institute of Technology (BHU) Varanasi", code: "IIT-BHU", city: "Varanasi", state: "Uttar Pradesh" },
    { name: "Indian Institute of Technology Indore (IITI)", code: "IITI", city: "Indore", state: "Madhya Pradesh" },
    { name: "Indian Institute of Technology Gandhinagar", code: "IITGN", city: "Gandhinagar", state: "Gujarat" },
    { name: "Indian Institute of Technology Ropar", code: "IITRPR", city: "Rupnagar", state: "Punjab" },
    { name: "Indian Institute of Technology Patna", code: "IITP", city: "Patna", state: "Bihar" },
    { name: "Indian Institute of Technology Bhubaneswar", code: "IITBBS", city: "Bhubaneswar", state: "Odisha" },
    { name: "Indian Institute of Technology Jodhpur", code: "IITJ", city: "Jodhpur", state: "Rajasthan" },
    { name: "Indian Institute of Technology Mandi", code: "IITMandi", city: "Mandi", state: "Himachal Pradesh" },
    { name: "Indian Institute of Technology (ISM) Dhanbad", code: "IIT-ISM", city: "Dhanbad", state: "Jharkhand" },

    // ── BITS & IIITs ──
    { name: "BITS Pilani (Pilani Campus)", code: "BITS-P", city: "Pilani", state: "Rajasthan" },
    { name: "BITS Pilani (K.K. Birla Goa Campus)", code: "BITS-G", city: "Goa", state: "Goa" },
    { name: "BITS Pilani (Hyderabad Campus)", code: "BITS-H", city: "Hyderabad", state: "Telangana" },
    { name: "International Institute of Information Technology Hyderabad (IIIT-H)", code: "IIITH", city: "Hyderabad", state: "Telangana" },
    { name: "International Institute of Information Technology Bangalore (IIIT-B)", code: "IIITB", city: "Bengaluru", state: "Karnataka" },
    { name: "Indraprastha Institute of Information Technology Delhi (IIIT-D)", code: "IIITD", city: "New Delhi", state: "Delhi" },
    { name: "Indian Institute of Information Technology Allahabad (IIIT-A)", code: "IIITA", city: "Prayagraj", state: "Uttar Pradesh" },
    { name: "Indian Institute of Information Technology Gwalior (ABV-IIITM)", code: "IIITM", city: "Gwalior", state: "Madhya Pradesh" },
    { name: "Indian Institute of Information Technology Lucknow (IIIT-L)", code: "IIITL", city: "Lucknow", state: "Uttar Pradesh" },

    // ── Top NITs ──
    { name: "National Institute of Technology Tiruchirappalli (NIT Trichy)", code: "NITT", city: "Tiruchirappalli", state: "Tamil Nadu" },
    { name: "National Institute of Technology Karnataka (NIT Surathkal)", code: "NITK", city: "Surathkal", state: "Karnataka" },
    { name: "National Institute of Technology Rourkela (NIT Rourkela)", code: "NITR", city: "Rourkela", state: "Odisha" },
    { name: "National Institute of Technology Warangal (NIT Warangal)", code: "NITW", city: "Warangal", state: "Telangana" },
    { name: "National Institute of Technology Calicut (NIT Calicut)", code: "NITC", city: "Kozhikode", state: "Kerala" },
    { name: "Visvesvaraya National Institute of Technology (VNIT Nagpur)", code: "VNIT", city: "Nagpur", state: "Maharashtra" },
    { name: "Malaviya National Institute of Technology (MNIT Jaipur)", code: "MNIT", city: "Jaipur", state: "Rajasthan" },
    { name: "Motilal Nehru National Institute of Technology (MNNIT Allahabad)", code: "MNNIT", city: "Prayagraj", state: "Uttar Pradesh" },
    { name: "Dr. B. R. Ambedkar National Institute of Technology (NIT Jalandhar)", code: "NITJ", city: "Jalandhar", state: "Punjab" },
    { name: "National Institute of Technology Kurukshetra (NITKKR)", code: "NITKKR", city: "Kurukshetra", state: "Haryana" },
    { name: "National Institute of Technology Silchar (NIT Silchar)", code: "NITS", city: "Silchar", state: "Assam" },
    { name: "National Institute of Technology Durgapur (NIT Durgapur)", code: "NITDGP", city: "Durgapur", state: "West Bengal" },
    { name: "National Institute of Technology Patna (NIT Patna)", code: "NITP", city: "Patna", state: "Bihar" },
    { name: "Maulana Azad National Institute of Technology (MANIT Bhopal)", code: "MANIT", city: "Bhopal", state: "Madhya Pradesh" },
    { name: "National Institute of Technology Delhi (NIT Delhi)", code: "NITD", city: "New Delhi", state: "Delhi" },

    // ── Leading State & Technical Universities / Colleges ──
    { name: "Delhi Technological University (DTU)", code: "DTU", city: "New Delhi", state: "Delhi" },
    { name: "Netaji Subhas University of Technology (NSUT)", code: "NSUT", city: "New Delhi", state: "Delhi" },
    { name: "College of Engineering Pune (COEP)", code: "COEP", city: "Pune", state: "Maharashtra" },
    { name: "Veermata Jijabai Technological Institute (VJTI)", code: "VJTI", city: "Mumbai", state: "Maharashtra" },
    { name: "Jadavpur University (Faculty of Engineering)", code: "JU", city: "Kolkata", state: "West Bengal" },
    { name: "Indian Institute of Engineering Science and Technology (IIEST Shibpur)", code: "IIEST", city: "Howrah", state: "West Bengal" },
    { name: "Harcourt Butler Technical University (HBTU)", code: "HBTU", city: "Kanpur", state: "Uttar Pradesh" },
    { name: "PSG College of Technology", code: "PSG Tech", city: "Coimbatore", state: "Tamil Nadu" },
    { name: "RV College of Engineering (RVCE)", code: "RVCE", city: "Bengaluru", state: "Karnataka" },
    { name: "BMS College of Engineering (BMSCE)", code: "BMSCE", city: "Bengaluru", state: "Karnataka" },
    { name: "M. S. Ramaiah Institute of Technology (MSRIT)", code: "MSRIT", city: "Bengaluru", state: "Karnataka" },
    { name: "PES University", code: "PESU", city: "Bengaluru", state: "Karnataka" },
    { name: "Dhirubhai Ambani Institute of Information and Communication Technology (DA-IICT)", code: "DA-IICT", city: "Gandhinagar", state: "Gujarat" },

    // ── Leading Private Universities & Colleges ──
    { name: "Galgotias University (Greater Noida)", code: "GU", city: "Greater Noida", state: "Uttar Pradesh" },
    { name: "Galgotias College of Engineering and Technology (GCET)", code: "GCET", city: "Greater Noida", state: "Uttar Pradesh" },
    { name: "Vellore Institute of Technology (VIT Vellore)", code: "VIT-V", city: "Vellore", state: "Tamil Nadu" },
    { name: "Vellore Institute of Technology (VIT Chennai)", code: "VIT-C", city: "Chennai", state: "Tamil Nadu" },
    { name: "SRM Institute of Science and Technology (KTR Campus)", code: "SRM-KTR", city: "Chennai", state: "Tamil Nadu" },
    { name: "Manipal Institute of Technology (MIT Manipal)", code: "MIT-M", city: "Manipal", state: "Karnataka" },
    { name: "Thapar Institute of Engineering and Technology (TIET)", code: "Thapar", city: "Patiala", state: "Punjab" },
    { name: "Amity University (Noida Campus)", code: "Amity-Noida", city: "Noida", state: "Uttar Pradesh" },
    { name: "Chandigarh University (CU)", code: "CU", city: "Mohali", state: "Punjab" },
    { name: "Lovely Professional University (LPU)", code: "LPU", city: "Phagwara", state: "Punjab" },
    { name: "Shiv Nadar University (SNU)", code: "SNU", city: "Greater Noida", state: "Uttar Pradesh" },
    { name: "Bennett University", code: "Bennett", city: "Greater Noida", state: "Uttar Pradesh" },
    { name: "Ashoka University", code: "Ashoka", city: "Sonipat", state: "Haryana" },
    { name: "O.P. Jindal Global University", code: "JGU", city: "Sonipat", state: "Haryana" },
    { name: "Christ University (Central Campus)", code: "Christ", city: "Bengaluru", state: "Karnataka" },
    { name: "Symbiosis International University (SIU Pune)", code: "SIU", city: "Pune", state: "Maharashtra" },
    { name: "NMIMS (Mukesh Patel School of Technology Management & Engineering)", code: "NMIMS-MPSTME", city: "Mumbai", state: "Maharashtra" },
    { name: "Kalinga Institute of Industrial Technology (KIIT)", code: "KIIT", city: "Bhubaneswar", state: "Odisha" },
    { name: "Siksha 'O' Anusandhan (SOA University)", code: "SOA", city: "Bhubaneswar", state: "Odisha" },
    { name: "Jaypee Institute of Information Technology (JIIT Sector 62)", code: "JIIT-62", city: "Noida", state: "Uttar Pradesh" },
    { name: "Jaypee Institute of Information Technology (JIIT Sector 128)", code: "JIIT-128", city: "Noida", state: "Uttar Pradesh" },
    { name: "KIET Group of Institutions", code: "KIET", city: "Ghaziabad", state: "Uttar Pradesh" },
    { name: "AKGEC (Ajay Kumar Garg Engineering College)", code: "AKGEC", city: "Ghaziabad", state: "Uttar Pradesh" },
    { name: "JSS Academy of Technical Education", code: "JSSATE", city: "Noida", state: "Uttar Pradesh" },
    { name: "ABES Engineering College", code: "ABES", city: "Ghaziabad", state: "Uttar Pradesh" },
    { name: "GL Bajaj Institute of Technology and Management", code: "GL Bajaj", city: "Greater Noida", state: "Uttar Pradesh" },

    // ── Premier Delhi University Colleges ──
    { name: "St. Stephen's College (University of Delhi)", code: "Stephens", city: "New Delhi", state: "Delhi" },
    { name: "Hindu College (University of Delhi)", code: "Hindu", city: "New Delhi", state: "Delhi" },
    { name: "Shri Ram College of Commerce (SRCC)", code: "SRCC", city: "New Delhi", state: "Delhi" },
    { name: "Miranda House (University of Delhi)", code: "Miranda", city: "New Delhi", state: "Delhi" },
    { name: "Lady Shri Ram College for Women (LSR)", code: "LSR", city: "New Delhi", state: "Delhi" },
    { name: "Hansraj College (University of Delhi)", code: "Hansraj", city: "New Delhi", state: "Delhi" },
    { name: "Ramjas College (University of Delhi)", code: "Ramjas", city: "New Delhi", state: "Delhi" },
    { name: "Kirori Mal College (KMC DU)", code: "KMC", city: "New Delhi", state: "Delhi" },
    { name: "Sri Venkateswara College (Venky DU)", code: "Venky", city: "New Delhi", state: "Delhi" },
    { name: "Gargi College (University of Delhi)", code: "Gargi", city: "New Delhi", state: "Delhi" },
    { name: "Atma Ram Sanatan Dharma College (ARSD)", code: "ARSD", city: "New Delhi", state: "Delhi" },
    { name: "Deen Dayal Upadhyaya College (DDUC)", code: "DDUC", city: "New Delhi", state: "Delhi" },
    { name: "Acharya Narendra Dev College (ANDC)", code: "ANDC", city: "New Delhi", state: "Delhi" },

    // ── Premier Medical & Research ──
    { name: "All India Institute of Medical Sciences (AIIMS New Delhi)", code: "AIIMS-D", city: "New Delhi", state: "Delhi" },
    { name: "Christian Medical College (CMC Vellore)", code: "CMC", city: "Vellore", state: "Tamil Nadu" },
    { name: "King George's Medical University (KGMU)", code: "KGMU", city: "Lucknow", state: "Uttar Pradesh" },
    { name: "Kasturba Medical College (KMC Manipal)", code: "KMC-M", city: "Manipal", state: "Karnataka" },
    { name: "Maulana Azad Medical College (MAMC)", code: "MAMC", city: "New Delhi", state: "Delhi" },
    { name: "Vardhman Mahavir Medical College & Safdarjung Hospital (VMMC)", code: "VMMC", city: "New Delhi", state: "Delhi" },
    { name: "Armed Forces Medical College (AFMC Pune)", code: "AFMC", city: "Pune", state: "Maharashtra" },
    { name: "Post Graduate Institute of Medical Education and Research (PGIMER)", code: "PGIMER", city: "Chandigarh", state: "Chandigarh" },

    // ── Premier Management, Law & Design ──
    { name: "Indian Institute of Management Ahmedabad (IIM-A)", code: "IIMA", city: "Ahmedabad", state: "Gujarat" },
    { name: "Indian Institute of Management Bangalore (IIM-B)", code: "IIMB", city: "Bengaluru", state: "Karnataka" },
    { name: "Indian Institute of Management Calcutta (IIM-C)", code: "IIMC", city: "Kolkata", state: "West Bengal" },
    { name: "Indian Institute of Management Lucknow (IIM-L)", code: "IIML", city: "Lucknow", state: "Uttar Pradesh" },
    { name: "XLRI Xavier School of Management", code: "XLRI", city: "Jamshedpur", state: "Jharkhand" },
    { name: "Faculty of Management Studies (FMS Delhi)", code: "FMS", city: "New Delhi", state: "Delhi" },
    { name: "National Law School of India University (NLSIU)", code: "NLSIU", city: "Bengaluru", state: "Karnataka" },
    { name: "National Law University Delhi (NLU Delhi)", code: "NLU-D", city: "New Delhi", state: "Delhi" },
    { name: "NALSAR University of Law", code: "NALSAR", city: "Hyderabad", state: "Telangana" },
    { name: "National Institute of Design (NID Ahmedabad)", code: "NID", city: "Ahmedabad", state: "Gujarat" },
    { name: "National Institute of Fashion Technology (NIFT Delhi)", code: "NIFT-D", city: "New Delhi", state: "Delhi" }
];

async function seedColleges() {
    try {
        await connectDB();
        console.log("Connected to MongoDB for Famous Colleges Seed.");

        let insertedCount = 0;
        let updatedCount = 0;

        for (const item of FAMOUS_COLLEGES) {
            // Check if university with matching name exists to link foreign key
            const uniDoc = await University.findOne({
                name: new RegExp(`^${item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                isActive: true
            }).select("_id");

            const collegeData = {
                name: item.name,
                code: item.code || "",
                city: item.city || "",
                state: item.state || "",
                university: uniDoc ? uniDoc._id : null,
                isActive: true
            };

            const existing = await College.findOne({ name: item.name });
            if (!existing) {
                await College.create(collegeData);
                insertedCount++;
            } else {
                await College.updateOne({ name: item.name }, { $set: collegeData });
                updatedCount++;
            }
        }

        const totalInDb = await College.countDocuments({ isActive: true });
        console.log(`✅ Seed finished! Inserted: ${insertedCount}, Updated: ${updatedCount}. Total Active Colleges in DB: ${totalInDb}`);
        process.exit(0);
    } catch (err) {
        console.error("❌ Error seeding famous colleges:", err);
        process.exit(1);
    }
}

seedColleges();
