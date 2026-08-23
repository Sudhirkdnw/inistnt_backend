const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectDB = require("../db/db");
const College = require("../models/college.model");
const University = require("../models/university.model");

const DATASET = [
    // ═════════════════════════════════════════════════════════════════════════
    // 1. INSTITUTES OF NATIONAL IMPORTANCE / AUTONOMOUS UNIVERSITIES (SAME)
    // ═════════════════════════════════════════════════════════════════════════
    {
        collegeName: "Indian Institute of Technology Bombay (IITB)",
        code: "IITB",
        city: "Mumbai",
        state: "Maharashtra",
        universityName: "Indian Institute of Technology Bombay"
    },
    {
        collegeName: "Indian Institute of Technology Delhi (IITD)",
        code: "IITD",
        city: "New Delhi",
        state: "Delhi",
        universityName: "Indian Institute of Technology Delhi"
    },
    {
        collegeName: "Indian Institute of Technology Madras (IITM)",
        code: "IITM",
        city: "Chennai",
        state: "Tamil Nadu",
        universityName: "Indian Institute of Technology Madras"
    },
    {
        collegeName: "Indian Institute of Technology Kanpur (IITK)",
        code: "IITK",
        city: "Kanpur",
        state: "Uttar Pradesh",
        universityName: "Indian Institute of Technology Kanpur"
    },
    {
        collegeName: "Indian Institute of Technology Kharagpur (IITKGP)",
        code: "IITKGP",
        city: "Kharagpur",
        state: "West Bengal",
        universityName: "Indian Institute of Technology Kharagpur"
    },
    {
        collegeName: "Indian Institute of Technology Roorkee (IITR)",
        code: "IITR",
        city: "Roorkee",
        state: "Uttarakhand",
        universityName: "Indian Institute of Technology Roorkee"
    },
    {
        collegeName: "Indian Institute of Technology Guwahati (IITG)",
        code: "IITG",
        city: "Guwahati",
        state: "Assam",
        universityName: "Indian Institute of Technology Guwahati"
    },
    {
        collegeName: "Indian Institute of Technology Hyderabad (IITH)",
        code: "IITH",
        city: "Hyderabad",
        state: "Telangana",
        universityName: "Indian Institute of Technology Hyderabad"
    },
    {
        collegeName: "Indian Institute of Technology (BHU) Varanasi",
        code: "IIT-BHU",
        city: "Varanasi",
        state: "Uttar Pradesh",
        universityName: "Banaras Hindu University (BHU)"
    },
    {
        collegeName: "Indian Institute of Technology Indore (IITI)",
        code: "IITI",
        city: "Indore",
        state: "Madhya Pradesh",
        universityName: "Indian Institute of Technology Indore"
    },
    {
        collegeName: "Indian Institute of Technology Gandhinagar (IITGN)",
        code: "IITGN",
        city: "Gandhinagar",
        state: "Gujarat",
        universityName: "Indian Institute of Technology Gandhinagar"
    },
    {
        collegeName: "Indian Institute of Technology Ropar (IITRPR)",
        code: "IITRPR",
        city: "Rupnagar",
        state: "Punjab",
        universityName: "Indian Institute of Technology Ropar"
    },
    {
        collegeName: "Indian Institute of Technology Patna (IITP)",
        code: "IITP",
        city: "Patna",
        state: "Bihar",
        universityName: "Indian Institute of Technology Patna"
    },
    {
        collegeName: "Indian Institute of Technology Bhubaneswar (IITBBS)",
        code: "IITBBS",
        city: "Bhubaneswar",
        state: "Odisha",
        universityName: "Indian Institute of Technology Bhubaneswar"
    },
    {
        collegeName: "Indian Institute of Technology Jodhpur (IITJ)",
        code: "IITJ",
        city: "Jodhpur",
        state: "Rajasthan",
        universityName: "Indian Institute of Technology Jodhpur"
    },
    {
        collegeName: "Indian Institute of Technology Mandi (IIT Mandi)",
        code: "IITMandi",
        city: "Mandi",
        state: "Himachal Pradesh",
        universityName: "Indian Institute of Technology Mandi"
    },
    {
        collegeName: "Indian Institute of Technology (ISM) Dhanbad",
        code: "IIT-ISM",
        city: "Dhanbad",
        state: "Jharkhand",
        universityName: "Indian Institute of Technology (ISM) Dhanbad"
    },

    // ── BITS Pilani & Premier IIITs ──
    {
        collegeName: "BITS Pilani (Pilani Campus)",
        code: "BITS-P",
        city: "Pilani",
        state: "Rajasthan",
        universityName: "Birla Institute of Technology and Science (BITS Pilani)"
    },
    {
        collegeName: "BITS Pilani (K.K. Birla Goa Campus)",
        code: "BITS-G",
        city: "Goa",
        state: "Goa",
        universityName: "Birla Institute of Technology and Science (BITS Pilani)"
    },
    {
        collegeName: "BITS Pilani (Hyderabad Campus)",
        code: "BITS-H",
        city: "Hyderabad",
        state: "Telangana",
        universityName: "Birla Institute of Technology and Science (BITS Pilani)"
    },
    {
        collegeName: "International Institute of Information Technology Hyderabad (IIIT-H)",
        code: "IIITH",
        city: "Hyderabad",
        state: "Telangana",
        universityName: "International Institute of Information Technology Hyderabad"
    },
    {
        collegeName: "International Institute of Information Technology Bangalore (IIIT-B)",
        code: "IIITB",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "International Institute of Information Technology Bangalore"
    },
    {
        collegeName: "Indraprastha Institute of Information Technology Delhi (IIIT-D)",
        code: "IIITD",
        city: "New Delhi",
        state: "Delhi",
        universityName: "Indraprastha Institute of Information Technology Delhi"
    },
    {
        collegeName: "Indian Institute of Information Technology Allahabad (IIIT-A)",
        code: "IIITA",
        city: "Prayagraj",
        state: "Uttar Pradesh",
        universityName: "Indian Institute of Information Technology Allahabad"
    },
    {
        collegeName: "Indian Institute of Information Technology Gwalior (ABV-IIITM)",
        code: "IIITM",
        city: "Gwalior",
        state: "Madhya Pradesh",
        universityName: "Atal Bihari Vajpayee Indian Institute of Information Technology and Management"
    },
    {
        collegeName: "Indian Institute of Information Technology Lucknow (IIIT-L)",
        code: "IIITL",
        city: "Lucknow",
        state: "Uttar Pradesh",
        universityName: "Indian Institute of Information Technology Lucknow"
    },

    // ── Premier NITs ──
    {
        collegeName: "National Institute of Technology Tiruchirappalli (NIT Trichy)",
        code: "NITT",
        city: "Tiruchirappalli",
        state: "Tamil Nadu",
        universityName: "National Institute of Technology Tiruchirappalli"
    },
    {
        collegeName: "National Institute of Technology Karnataka (NIT Surathkal)",
        code: "NITK",
        city: "Surathkal",
        state: "Karnataka",
        universityName: "National Institute of Technology Karnataka"
    },
    {
        collegeName: "National Institute of Technology Rourkela (NIT Rourkela)",
        code: "NITR",
        city: "Rourkela",
        state: "Odisha",
        universityName: "National Institute of Technology Rourkela"
    },
    {
        collegeName: "National Institute of Technology Warangal (NIT Warangal)",
        code: "NITW",
        city: "Warangal",
        state: "Telangana",
        universityName: "National Institute of Technology Warangal"
    },
    {
        collegeName: "National Institute of Technology Calicut (NIT Calicut)",
        code: "NITC",
        city: "Kozhikode",
        state: "Kerala",
        universityName: "National Institute of Technology Calicut"
    },
    {
        collegeName: "Visvesvaraya National Institute of Technology (VNIT Nagpur)",
        code: "VNIT",
        city: "Nagpur",
        state: "Maharashtra",
        universityName: "Visvesvaraya National Institute of Technology Nagpur"
    },
    {
        collegeName: "Malaviya National Institute of Technology (MNIT Jaipur)",
        code: "MNIT",
        city: "Jaipur",
        state: "Rajasthan",
        universityName: "Malaviya National Institute of Technology Jaipur"
    },
    {
        collegeName: "Motilal Nehru National Institute of Technology (MNNIT Allahabad)",
        code: "MNNIT",
        city: "Prayagraj",
        state: "Uttar Pradesh",
        universityName: "Motilal Nehru National Institute of Technology Allahabad"
    },
    {
        collegeName: "Dr. B. R. Ambedkar National Institute of Technology (NIT Jalandhar)",
        code: "NITJ",
        city: "Jalandhar",
        state: "Punjab",
        universityName: "Dr. B. R. Ambedkar National Institute of Technology Jalandhar"
    },
    {
        collegeName: "National Institute of Technology Kurukshetra (NITKKR)",
        code: "NITKKR",
        city: "Kurukshetra",
        state: "Haryana",
        universityName: "National Institute of Technology Kurukshetra"
    },
    {
        collegeName: "National Institute of Technology Silchar (NIT Silchar)",
        code: "NITS",
        city: "Silchar",
        state: "Assam",
        universityName: "National Institute of Technology Silchar"
    },
    {
        collegeName: "National Institute of Technology Durgapur (NIT Durgapur)",
        code: "NITDGP",
        city: "Durgapur",
        state: "West Bengal",
        universityName: "National Institute of Technology Durgapur"
    },
    {
        collegeName: "National Institute of Technology Patna (NIT Patna)",
        code: "NITP",
        city: "Patna",
        state: "Bihar",
        universityName: "National Institute of Technology Patna"
    },
    {
        collegeName: "Maulana Azad National Institute of Technology (MANIT Bhopal)",
        code: "MANIT",
        city: "Bhopal",
        state: "Madhya Pradesh",
        universityName: "Maulana Azad National Institute of Technology Bhopal"
    },
    {
        collegeName: "National Institute of Technology Delhi (NIT Delhi)",
        code: "NITD",
        city: "New Delhi",
        state: "Delhi",
        universityName: "National Institute of Technology Delhi"
    },

    // ── Premier State Autonomous / Technical Universities ──
    {
        collegeName: "Delhi Technological University (DTU)",
        code: "DTU",
        city: "New Delhi",
        state: "Delhi",
        universityName: "Delhi Technological University (DTU)"
    },
    {
        collegeName: "Netaji Subhas University of Technology (NSUT)",
        code: "NSUT",
        city: "New Delhi",
        state: "Delhi",
        universityName: "Netaji Subhas University of Technology (NSUT)"
    },
    {
        collegeName: "Indian Institute of Engineering Science and Technology (IIEST Shibpur)",
        code: "IIEST",
        city: "Howrah",
        state: "West Bengal",
        universityName: "Indian Institute of Engineering Science and Technology Shibpur"
    },
    {
        collegeName: "Jadavpur University (Faculty of Engineering)",
        code: "JU",
        city: "Kolkata",
        state: "West Bengal",
        universityName: "Jadavpur University"
    },
    {
        collegeName: "Harcourt Butler Technical University (HBTU)",
        code: "HBTU",
        city: "Kanpur",
        state: "Uttar Pradesh",
        universityName: "Harcourt Butler Technical University"
    },

    // ═════════════════════════════════════════════════════════════════════════
    // 2. DELHI UNIVERSITY (DU) AFFILIATED COLLEGES
    // ═════════════════════════════════════════════════════════════════════════
    {
        collegeName: "St. Stephen's College (University of Delhi)",
        code: "Stephens",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Hindu College (University of Delhi)",
        code: "Hindu",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Shri Ram College of Commerce (SRCC)",
        code: "SRCC",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Miranda House (University of Delhi)",
        code: "Miranda",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Lady Shri Ram College for Women (LSR)",
        code: "LSR",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Hansraj College (University of Delhi)",
        code: "Hansraj",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Ramjas College (University of Delhi)",
        code: "Ramjas",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Kirori Mal College (KMC DU)",
        code: "KMC",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Sri Venkateswara College (Venky DU)",
        code: "Venky",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Gargi College (University of Delhi)",
        code: "Gargi",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Atma Ram Sanatan Dharma College (ARSD)",
        code: "ARSD",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Deen Dayal Upadhyaya College (DDUC)",
        code: "DDUC",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Acharya Narendra Dev College (ANDC)",
        code: "ANDC",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Faculty of Management Studies (FMS Delhi)",
        code: "FMS",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },
    {
        collegeName: "Maulana Azad Medical College (MAMC)",
        code: "MAMC",
        city: "New Delhi",
        state: "Delhi",
        universityName: "University of Delhi (DU)"
    },

    // ═════════════════════════════════════════════════════════════════════════
    // 3. AKTU (Dr. A.P.J. Abdul Kalam Technical University) AFFILIATED COLLEGES
    // ═════════════════════════════════════════════════════════════════════════
    {
        collegeName: "Galgotias College of Engineering and Technology (GCET)",
        code: "GCET",
        city: "Greater Noida",
        state: "Uttar Pradesh",
        universityName: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)"
    },
    {
        collegeName: "KIET Group of Institutions",
        code: "KIET",
        city: "Ghaziabad",
        state: "Uttar Pradesh",
        universityName: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)"
    },
    {
        collegeName: "AKGEC (Ajay Kumar Garg Engineering College)",
        code: "AKGEC",
        city: "Ghaziabad",
        state: "Uttar Pradesh",
        universityName: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)"
    },
    {
        collegeName: "JSS Academy of Technical Education (JSS Noida)",
        code: "JSSATE",
        city: "Noida",
        state: "Uttar Pradesh",
        universityName: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)"
    },
    {
        collegeName: "ABES Engineering College",
        code: "ABES",
        city: "Ghaziabad",
        state: "Uttar Pradesh",
        universityName: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)"
    },
    {
        collegeName: "GL Bajaj Institute of Technology and Management",
        code: "GL Bajaj",
        city: "Greater Noida",
        state: "Uttar Pradesh",
        universityName: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)"
    },
    {
        collegeName: "IMS Engineering College (IMSEC)",
        code: "IMSEC",
        city: "Ghaziabad",
        state: "Uttar Pradesh",
        universityName: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)"
    },
    {
        collegeName: "Raj Kumar Goel Institute of Technology (RKGIT)",
        code: "RKGIT",
        city: "Ghaziabad",
        state: "Uttar Pradesh",
        universityName: "Dr. A.P.J. Abdul Kalam Technical University (AKTU)"
    },

    // ═════════════════════════════════════════════════════════════════════════
    // 4. VTU (Visvesvaraya Technological University) AFFILIATED COLLEGES
    // ═════════════════════════════════════════════════════════════════════════
    {
        collegeName: "RV College of Engineering (RVCE)",
        code: "RVCE",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "Visvesvaraya Technological University (VTU)"
    },
    {
        collegeName: "BMS College of Engineering (BMSCE)",
        code: "BMSCE",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "Visvesvaraya Technological University (VTU)"
    },
    {
        collegeName: "M. S. Ramaiah Institute of Technology (MSRIT)",
        code: "MSRIT",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "Visvesvaraya Technological University (VTU)"
    },
    {
        collegeName: "Dayananda Sagar College of Engineering (DSCE)",
        code: "DSCE",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "Visvesvaraya Technological University (VTU)"
    },
    {
        collegeName: "Bangalore Institute of Technology (BIT)",
        code: "BIT",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "Visvesvaraya Technological University (VTU)"
    },

    // ═════════════════════════════════════════════════════════════════════════
    // 5. GGSIPU (Guru Gobind Singh Indraprastha University) AFFILIATED COLLEGES
    // ═════════════════════════════════════════════════════════════════════════
    {
        collegeName: "University School of Information, Communication and Technology (USICT)",
        code: "USICT",
        city: "New Delhi",
        state: "Delhi",
        universityName: "Guru Gobind Singh Indraprastha University (GGSIPU)"
    },
    {
        collegeName: "Maharaja Agrasen Institute of Technology (MAIT)",
        code: "MAIT",
        city: "New Delhi",
        state: "Delhi",
        universityName: "Guru Gobind Singh Indraprastha University (GGSIPU)"
    },
    {
        collegeName: "Bharati Vidyapeeth's College of Engineering (BVCOE Delhi)",
        code: "BVCOE",
        city: "New Delhi",
        state: "Delhi",
        universityName: "Guru Gobind Singh Indraprastha University (GGSIPU)"
    },
    {
        collegeName: "Maharaja Surajmal Institute of Technology (MSIT)",
        code: "MSIT",
        city: "New Delhi",
        state: "Delhi",
        universityName: "Guru Gobind Singh Indraprastha University (GGSIPU)"
    },
    {
        collegeName: "Vardhman Mahavir Medical College & Safdarjung Hospital (VMMC)",
        code: "VMMC",
        city: "New Delhi",
        state: "Delhi",
        universityName: "Guru Gobind Singh Indraprastha University (GGSIPU)"
    },

    // ═════════════════════════════════════════════════════════════════════════
    // 6. ANNA UNIVERSITY / PUNE / MUMBAI AFFILIATED COLLEGES
    // ═════════════════════════════════════════════════════════════════════════
    {
        collegeName: "College of Engineering, Guindy (CEG Anna University)",
        code: "CEG",
        city: "Chennai",
        state: "Tamil Nadu",
        universityName: "Anna University"
    },
    {
        collegeName: "Madras Institute of Technology (MIT Chromepet)",
        code: "MIT-Chennai",
        city: "Chennai",
        state: "Tamil Nadu",
        universityName: "Anna University"
    },
    {
        collegeName: "PSG College of Technology",
        code: "PSG Tech",
        city: "Coimbatore",
        state: "Tamil Nadu",
        universityName: "Anna University"
    },
    {
        collegeName: "SSN College of Engineering",
        code: "SSN",
        city: "Chennai",
        state: "Tamil Nadu",
        universityName: "Anna University"
    },
    {
        collegeName: "College of Engineering Pune (COEP Technological University)",
        code: "COEP",
        city: "Pune",
        state: "Maharashtra",
        universityName: "Savitribai Phule Pune University (SPPU)"
    },
    {
        collegeName: "Pune Institute of Computer Technology (PICT)",
        code: "PICT",
        city: "Pune",
        state: "Maharashtra",
        universityName: "Savitribai Phule Pune University (SPPU)"
    },
    {
        collegeName: "Vishwakarma Institute of Technology (VIT Pune)",
        code: "VIT-Pune",
        city: "Pune",
        state: "Maharashtra",
        universityName: "Savitribai Phule Pune University (SPPU)"
    },
    {
        collegeName: "Veermata Jijabai Technological Institute (VJTI Mumbai)",
        code: "VJTI",
        city: "Mumbai",
        state: "Maharashtra",
        universityName: "University of Mumbai"
    },
    {
        collegeName: "Sardar Patel Institute of Technology (SPIT Mumbai)",
        code: "SPIT",
        city: "Mumbai",
        state: "Maharashtra",
        universityName: "University of Mumbai"
    },

    // ═════════════════════════════════════════════════════════════════════════
    // 7. PRIVATE & DEEMED UNIVERSITIES (SAME IN UNIVERSITY & COLLEGE)
    // ═════════════════════════════════════════════════════════════════════════
    {
        collegeName: "Galgotias University",
        code: "GU",
        city: "Greater Noida",
        state: "Uttar Pradesh",
        universityName: "Galgotias University"
    },
    {
        collegeName: "Amity University (Noida Campus)",
        code: "Amity-Noida",
        city: "Noida",
        state: "Uttar Pradesh",
        universityName: "Amity University"
    },
    {
        collegeName: "Vellore Institute of Technology (VIT Vellore)",
        code: "VIT-V",
        city: "Vellore",
        state: "Tamil Nadu",
        universityName: "Vellore Institute of Technology (VIT)"
    },
    {
        collegeName: "Vellore Institute of Technology (VIT Chennai)",
        code: "VIT-C",
        city: "Chennai",
        state: "Tamil Nadu",
        universityName: "Vellore Institute of Technology (VIT)"
    },
    {
        collegeName: "SRM Institute of Science and Technology (KTR Campus)",
        code: "SRM-KTR",
        city: "Chennai",
        state: "Tamil Nadu",
        universityName: "SRM Institute of Science and Technology"
    },
    {
        collegeName: "Manipal Institute of Technology (MIT Manipal)",
        code: "MIT-M",
        city: "Manipal",
        state: "Karnataka",
        universityName: "Manipal Academy of Higher Education (MAHE)"
    },
    {
        collegeName: "Thapar Institute of Engineering and Technology (TIET)",
        code: "Thapar",
        city: "Patiala",
        state: "Punjab",
        universityName: "Thapar Institute of Engineering and Technology"
    },
    {
        collegeName: "Chandigarh University (CU)",
        code: "CU",
        city: "Mohali",
        state: "Punjab",
        universityName: "Chandigarh University"
    },
    {
        collegeName: "Lovely Professional University (LPU)",
        code: "LPU",
        city: "Phagwara",
        state: "Punjab",
        universityName: "Lovely Professional University (LPU)"
    },
    {
        collegeName: "Shiv Nadar University (SNU)",
        code: "SNU",
        city: "Greater Noida",
        state: "Uttar Pradesh",
        universityName: "Shiv Nadar University"
    },
    {
        collegeName: "Bennett University",
        code: "Bennett",
        city: "Greater Noida",
        state: "Uttar Pradesh",
        universityName: "Bennett University"
    },
    {
        collegeName: "Ashoka University",
        code: "Ashoka",
        city: "Sonipat",
        state: "Haryana",
        universityName: "Ashoka University"
    },
    {
        collegeName: "O.P. Jindal Global University",
        code: "JGU",
        city: "Sonipat",
        state: "Haryana",
        universityName: "O.P. Jindal Global University"
    },
    {
        collegeName: "Christ University (Central Campus)",
        code: "Christ",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "Christ University"
    },
    {
        collegeName: "Symbiosis International University (SIU Pune)",
        code: "SIU",
        city: "Pune",
        state: "Maharashtra",
        universityName: "Symbiosis International University"
    },
    {
        collegeName: "NMIMS (Mukesh Patel School of Technology Management & Engineering)",
        code: "NMIMS-MPSTME",
        city: "Mumbai",
        state: "Maharashtra",
        universityName: "Narsee Monjee Institute of Management Studies (NMIMS)"
    },
    {
        collegeName: "Kalinga Institute of Industrial Technology (KIIT)",
        code: "KIIT",
        city: "Bhubaneswar",
        state: "Odisha",
        universityName: "Kalinga Institute of Industrial Technology (KIIT)"
    },
    {
        collegeName: "Siksha 'O' Anusandhan (SOA University)",
        code: "SOA",
        city: "Bhubaneswar",
        state: "Odisha",
        universityName: "Siksha 'O' Anusandhan (SOA University)"
    },
    {
        collegeName: "Jaypee Institute of Information Technology (JIIT Sector 62)",
        code: "JIIT-62",
        city: "Noida",
        state: "Uttar Pradesh",
        universityName: "Jaypee Institute of Information Technology"
    },
    {
        collegeName: "Jaypee Institute of Information Technology (JIIT Sector 128)",
        code: "JIIT-128",
        city: "Noida",
        state: "Uttar Pradesh",
        universityName: "Jaypee Institute of Information Technology"
    },
    {
        collegeName: "PES University",
        code: "PESU",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "PES University"
    },
    {
        collegeName: "Dhirubhai Ambani Institute of Information and Communication Technology (DA-IICT)",
        code: "DA-IICT",
        city: "Gandhinagar",
        state: "Gujarat",
        universityName: "Dhirubhai Ambani Institute of Information and Communication Technology (DA-IICT)"
    },
    {
        collegeName: "Sharda University",
        code: "Sharda",
        city: "Greater Noida",
        state: "Uttar Pradesh",
        universityName: "Sharda University"
    },
    {
        collegeName: "Graphic Era University",
        code: "GEU",
        city: "Dehradun",
        state: "Uttarakhand",
        universityName: "Graphic Era University"
    },
    {
        collegeName: "University of Petroleum and Energy Studies (UPES)",
        code: "UPES",
        city: "Dehradun",
        state: "Uttarakhand",
        universityName: "University of Petroleum and Energy Studies (UPES)"
    },

    // ═════════════════════════════════════════════════════════════════════════
    // 8. PREMIER MEDICAL, MANAGEMENT & LAW INSTITUTES
    // ═════════════════════════════════════════════════════════════════════════
    {
        collegeName: "All India Institute of Medical Sciences (AIIMS New Delhi)",
        code: "AIIMS-D",
        city: "New Delhi",
        state: "Delhi",
        universityName: "All India Institute of Medical Sciences (AIIMS New Delhi)"
    },
    {
        collegeName: "Christian Medical College (CMC Vellore)",
        code: "CMC",
        city: "Vellore",
        state: "Tamil Nadu",
        universityName: "The Tamil Nadu Dr. M.G.R. Medical University"
    },
    {
        collegeName: "King George's Medical University (KGMU)",
        code: "KGMU",
        city: "Lucknow",
        state: "Uttar Pradesh",
        universityName: "King George's Medical University"
    },
    {
        collegeName: "Kasturba Medical College (KMC Manipal)",
        code: "KMC-M",
        city: "Manipal",
        state: "Karnataka",
        universityName: "Manipal Academy of Higher Education (MAHE)"
    },
    {
        collegeName: "Armed Forces Medical College (AFMC Pune)",
        code: "AFMC",
        city: "Pune",
        state: "Maharashtra",
        universityName: "Maharashtra University of Health Sciences (MUHS)"
    },
    {
        collegeName: "Indian Institute of Management Ahmedabad (IIM-A)",
        code: "IIMA",
        city: "Ahmedabad",
        state: "Gujarat",
        universityName: "Indian Institute of Management Ahmedabad"
    },
    {
        collegeName: "Indian Institute of Management Bangalore (IIM-B)",
        code: "IIMB",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "Indian Institute of Management Bangalore"
    },
    {
        collegeName: "Indian Institute of Management Calcutta (IIM-C)",
        code: "IIMC",
        city: "Kolkata",
        state: "West Bengal",
        universityName: "Indian Institute of Management Calcutta"
    },
    {
        collegeName: "Indian Institute of Management Lucknow (IIM-L)",
        code: "IIML",
        city: "Lucknow",
        state: "Uttar Pradesh",
        universityName: "Indian Institute of Management Lucknow"
    },
    {
        collegeName: "XLRI Xavier School of Management",
        code: "XLRI",
        city: "Jamshedpur",
        state: "Jharkhand",
        universityName: "XLRI Xavier School of Management"
    },
    {
        collegeName: "National Law School of India University (NLSIU)",
        code: "NLSIU",
        city: "Bengaluru",
        state: "Karnataka",
        universityName: "National Law School of India University"
    },
    {
        collegeName: "National Law University Delhi (NLU Delhi)",
        code: "NLU-D",
        city: "New Delhi",
        state: "Delhi",
        universityName: "National Law University Delhi"
    },
    {
        collegeName: "NALSAR University of Law",
        code: "NALSAR",
        city: "Hyderabad",
        state: "Telangana",
        universityName: "NALSAR University of Law"
    },
    {
        collegeName: "National Institute of Design (NID Ahmedabad)",
        code: "NID",
        city: "Ahmedabad",
        state: "Gujarat",
        universityName: "National Institute of Design"
    },
    {
        collegeName: "National Institute of Fashion Technology (NIFT Delhi)",
        code: "NIFT-D",
        city: "New Delhi",
        state: "Delhi",
        universityName: "National Institute of Fashion Technology"
    }
];

async function seed() {
    try {
        await connectDB();
        console.log("Connected to MongoDB for Affiliation Seed.");

        let universitiesCreated = 0;
        let collegesUpserted = 0;

        for (const item of DATASET) {
            // 1. Ensure University exists in University collection
            let uniDoc = await University.findOne({
                name: new RegExp(`^${item.universityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
            });

            if (!uniDoc) {
                uniDoc = await University.create({
                    name: item.universityName,
                    city: item.city,
                    state: item.state,
                    isActive: true
                });
                universitiesCreated++;
            }

            // 2. Upsert College with exact university foreign key reference
            const collegeData = {
                name: item.collegeName,
                code: item.code || "",
                city: item.city || "",
                state: item.state || "",
                university: uniDoc._id,
                isActive: true
            };

            await College.findOneAndUpdate(
                { name: item.collegeName },
                { $set: collegeData },
                { upsert: true, returnDocument: 'after' }
            );

            collegesUpserted++;
        }

        const totalColleges = await College.countDocuments({ isActive: true });
        const totalUnis = await University.countDocuments({ isActive: true });

        console.log(`✅ Seed Completed!`);
        console.log(`- New Universities Added: ${universitiesCreated}`);
        console.log(`- Colleges Configured & Linked: ${collegesUpserted}`);
        console.log(`- Total Active Colleges in DB: ${totalColleges}`);
        console.log(`- Total Active Universities in DB: ${totalUnis}`);

        process.exit(0);
    } catch (err) {
        console.error("❌ Error seeding affiliations:", err);
        process.exit(1);
    }
}

seed();
