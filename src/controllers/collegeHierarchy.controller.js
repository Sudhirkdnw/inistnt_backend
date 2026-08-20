const University = require("../models/university.model");
const College = require("../models/college.model");
const Department = require("../models/department.model");
const Branch = require("../models/branch.model");

// ─── PUBLIC CASCADING API ENDPOINTS ──────────────────────────────────────────

exports.getUniversities = async (req, res) => {
    try {
        const list = await University.find({ isActive: true }).sort({ name: 1 });
        res.status(200).json({ list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getCampuses = async (req, res) => {
    try {
        const { universityId } = req.params;
        const list = await College.find({ university: universityId, isActive: true }).sort({ name: 1 });
        res.status(200).json({ list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getDepartments = async (req, res) => {
    try {
        const { campusId } = req.params;
        const list = await Department.find({ college: campusId, isActive: true }).sort({ name: 1 });
        res.status(200).json({ list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getBranches = async (req, res) => {
    try {
        const { departmentId } = req.params;
        const list = await Branch.find({ department: departmentId, isActive: true }).sort({ name: 1 });
        res.status(200).json({ list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── ADMIN MANAGEMENT ENDPOINTS (CRUD) ────────────────────────────────────────

// Universities CRUD
exports.adminGetUniversities = async (req, res) => {
    try {
        const list = await University.find().sort({ name: 1 });
        res.status(200).json({ list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateUniversity = async (req, res) => {
    try {
        const { name, isActive } = req.body;
        if (!name) return res.status(400).json({ message: "Name is required" });

        const item = await University.create({ name: name.trim(), isActive });
        res.status(201).json({ message: "University created", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "University already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateUniversity = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, isActive } = req.body;
        const item = await University.findByIdAndUpdate(id, { name, isActive }, { returnDocument: 'after' });
        res.status(200).json({ message: "University updated", item });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminDeleteUniversity = async (req, res) => {
    try {
        const { id } = req.params;
        await University.findByIdAndDelete(id);
        res.status(200).json({ message: "University deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Campuses CRUD
exports.adminGetCampuses = async (req, res) => {
    try {
        const list = await College.find().populate("university", "name").sort({ name: 1 });
        res.status(200).json({ list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateCampus = async (req, res) => {
    try {
        const { name, university, city, state, isActive } = req.body;
        if (!name || !university) return res.status(400).json({ message: "Name and university are required" });

        const item = await College.create({ name: name.trim(), university, city, state, isActive });
        res.status(201).json({ message: "Campus created", item });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateCampus = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, university, city, state, isActive } = req.body;
        const item = await College.findByIdAndUpdate(id, { name, university, city, state, isActive }, { returnDocument: 'after' });
        res.status(200).json({ message: "Campus updated", item });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminDeleteCampus = async (req, res) => {
    try {
        const { id } = req.params;
        await College.findByIdAndDelete(id);
        res.status(200).json({ message: "Campus deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Departments CRUD
exports.adminGetDepartments = async (req, res) => {
    try {
        const list = await Department.find().populate("college", "name").sort({ name: 1 });
        res.status(200).json({ list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateDepartment = async (req, res) => {
    try {
        const { name, college, isActive } = req.body;
        if (!name || !college) return res.status(400).json({ message: "Name and campus are required" });

        const item = await Department.create({ name: name.trim(), college, isActive });
        res.status(201).json({ message: "Department created", item });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, college, isActive } = req.body;
        const item = await Department.findByIdAndUpdate(id, { name, college, isActive }, { returnDocument: 'after' });
        res.status(200).json({ message: "Department updated", item });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminDeleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        await Department.findByIdAndDelete(id);
        res.status(200).json({ message: "Department deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Branches CRUD
exports.adminGetBranches = async (req, res) => {
    try {
        const list = await Branch.find().populate({ path: "department", populate: { path: "college", populate: { path: "university" } } }).sort({ name: 1 });
        res.status(200).json({ list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateBranch = async (req, res) => {
    try {
        const { name, department, isActive } = req.body;
        if (!name || !department) return res.status(400).json({ message: "Name and department are required" });

        const item = await Branch.create({ name: name.trim(), department, isActive });
        res.status(201).json({ message: "Branch created", item });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, department, isActive } = req.body;
        const item = await Branch.findByIdAndUpdate(id, { name, department, isActive }, { returnDocument: 'after' });
        res.status(200).json({ message: "Branch updated", item });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminDeleteBranch = async (req, res) => {
    try {
        const { id } = req.params;
        await Branch.findByIdAndDelete(id);
        res.status(200).json({ message: "Branch deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
