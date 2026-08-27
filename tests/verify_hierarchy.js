const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const University = require("../src/models/university.model");
const College = require("../src/models/college.model");
const userModel = require("../src/models/user.model");
const collegeHierarchyController = require("../src/controllers/collegeHierarchy.controller");

async function runTests() {
    console.log("Connecting to Mongo...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB!");

    try {
        // 1. Clean previous test items
        await University.deleteMany({ name: { $regex: /^__TEST_UNI__/i } });
        await College.deleteMany({ name: { $regex: /^__TEST_COLLEGE__/i } });
        await userModel.deleteMany({ username: { $regex: /^testuser_hierarchy/i } });

        // 2. Create Test Universities
        const uni1 = await University.create({
            name: "__TEST_UNI__ Alpha University",
            city: "Noida",
            state: "UP",
            isActive: true
        });

        const uni2 = await University.create({
            name: "__TEST_UNI__ Beta University",
            city: "Delhi",
            state: "Delhi",
            isActive: true
        });

        const disabledUni = await University.create({
            name: "__TEST_UNI__ Disabled University",
            city: "Mumbai",
            state: "MH",
            isActive: false
        });

        console.log("✓ Created Test Universities");

        // 3. Create Test Colleges
        const col1 = await College.create({
            name: "__TEST_COLLEGE__ School of Engineering Alpha",
            university: uni1._id,
            city: "Noida",
            state: "UP",
            isActive: true
        });

        const col2 = await College.create({
            name: "__TEST_COLLEGE__ School of Management Alpha",
            university: uni1._id,
            city: "Noida",
            state: "UP",
            isActive: true
        });

        const colBeta = await College.create({
            name: "__TEST_COLLEGE__ Department of Sciences Beta",
            university: uni2._id,
            city: "Delhi",
            state: "Delhi",
            isActive: true
        });

        const colDisabled = await College.create({
            name: "__TEST_COLLEGE__ Disabled College Alpha",
            university: uni1._id,
            city: "Noida",
            state: "UP",
            isActive: false
        });

        console.log("✓ Created Test Colleges");

        // 4. Test Public getUniversities
        const mockResUni = {
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) { this.data = data; return this; }
        };
        await collegeHierarchyController.getUniversities({ query: { q: "__TEST_UNI__" } }, mockResUni);
        console.log(`✓ getUniversities returned ${mockResUni.data.list.length} active test universities`);
        const foundDisabled = mockResUni.data.list.find(u => u.name.includes("Disabled"));
        if (foundDisabled) throw new Error("Disabled university appeared in getUniversities!");

        // 5. Test getCampuses with universityId for Alpha
        const mockResCamp1 = {
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) { this.data = data; return this; }
        };
        await collegeHierarchyController.getCampuses({ params: { universityId: uni1._id.toString() }, query: {} }, mockResCamp1);
        console.log(`✓ getCampuses for Uni1 returned ${mockResCamp1.data.list.length} colleges`);
        const names = mockResCamp1.data.list.map(c => c.name);
        if (!names.includes("__TEST_COLLEGE__ School of Engineering Alpha") || !names.includes("__TEST_COLLEGE__ School of Management Alpha")) {
            throw new Error("Missing expected colleges for Uni1!");
        }
        if (names.includes("__TEST_COLLEGE__ Department of Sciences Beta")) {
            throw new Error("Beta college leaked into Alpha university list!");
        }
        if (names.includes("__TEST_COLLEGE__ Disabled College Alpha")) {
            throw new Error("Disabled college appeared in active getCampuses list!");
        }

        // 6. Test getCampuses for Beta
        const mockResCamp2 = {
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) { this.data = data; return this; }
        };
        await collegeHierarchyController.getCampuses({ params: { universityId: uni2._id.toString() }, query: {} }, mockResCamp2);
        console.log(`✓ getCampuses for Uni2 returned ${mockResCamp2.data.list.length} colleges`);
        if (mockResCamp2.data.list.length !== 1 || mockResCamp2.data.list[0].name !== "__TEST_COLLEGE__ Department of Sciences Beta") {
            throw new Error("Uni2 did not return only Beta college!");
        }

        // 7. Clean up test records
        await University.deleteMany({ name: { $regex: /^__TEST_UNI__/i } });
        await College.deleteMany({ name: { $regex: /^__TEST_COLLEGE__/i } });
        console.log("✓ Cleaned up all test data successfully");

        console.log("\n ALL HIERARCHY TESTS PASSED SUCCESSFULLY!");
    } finally {
        await mongoose.disconnect();
    }
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
