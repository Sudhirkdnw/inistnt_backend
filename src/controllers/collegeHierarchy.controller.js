const University = require("../models/university.model");
const College = require("../models/college.model");
const Department = require("../models/department.model");
const Branch = require("../models/branch.model");

// ─── PUBLIC AUTOCOMPLETE & DIRECTORY ENDPOINTS ───────────────────────────────────

// GET /api/hierarchy/universities?q=
exports.getUniversities = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const filter = { isActive: true };

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [
                { name: searchRegex },
                { city: searchRegex },
                { state: searchRegex }
            ];
        }

        const list = await University.find(filter)
            .select("name city state isActive")
            .sort({ name: 1 })
            .limit(50)
            .lean();

        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /api/hierarchy/campuses?q= or /api/hierarchy/colleges?q=
exports.getCampuses = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const filter = { isActive: true };

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [
                { name: searchRegex },
                { city: searchRegex },
                { state: searchRegex },
                { code: searchRegex }
            ];
        }

        const list = await College.find(filter)
            .select("name code city state isActive")
            .sort({ name: 1 })
            .limit(50)
            .lean();

        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /api/hierarchy/departments?q=
exports.getDepartments = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const filter = { isActive: true };

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [
                { name: searchRegex },
                { code: searchRegex }
            ];
        }

        const list = await Department.find(filter)
            .select("name code isActive")
            .sort({ name: 1 })
            .limit(50)
            .lean();

        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /api/hierarchy/branches?q=
exports.getBranches = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const filter = { isActive: true };

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [
                { name: searchRegex },
                { degree: searchRegex }
            ];
        }

        const list = await Branch.find(filter)
            .select("name degree isActive")
            .sort({ name: 1 })
            .limit(50)
            .lean();

        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── ADMIN INDEPENDENT MANAGEMENT ENDPOINTS (CRUD) ───────────────────────────

// Universities CRUD
exports.adminGetUniversities = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        let filter = {};
        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [{ name: searchRegex }, { city: searchRegex }, { state: searchRegex }];
        }

        const list = await University.find(filter).sort({ name: 1 }).lean();
        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateUniversity = async (req, res) => {
    try {
        const { name, city, state, isActive } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: "University name is required" });

        const item = await University.create({
            name: name.trim(),
            city: city ? city.trim() : "",
            state: state ? state.trim() : "",
            isActive: isActive !== false
        });
        res.status(201).json({ success: true, message: "University created successfully", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "University with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateUniversity = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, city, state, isActive } = req.body;
        const item = await University.findByIdAndUpdate(
            id,
            {
                name: name ? name.trim() : undefined,
                city: city !== undefined ? city.trim() : undefined,
                state: state !== undefined ? state.trim() : undefined,
                isActive
            },
            { returnDocument: 'after' }
        );
        res.status(200).json({ success: true, message: "University updated successfully", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "University with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminDeleteUniversity = async (req, res) => {
    try {
        const { id } = req.params;
        await University.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "University deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Campuses / Colleges CRUD (Completely Independent)
exports.adminGetCampuses = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        let filter = {};
        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [{ name: searchRegex }, { city: searchRegex }, { state: searchRegex }, { code: searchRegex }];
        }

        const list = await College.find(filter).sort({ name: 1 }).lean();
        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateCampus = async (req, res) => {
    try {
        const { name, city, state, code, isActive } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: "College/Campus name is required" });

        const item = await College.create({
            name: name.trim(),
            code: code ? code.trim() : "",
            city: city ? city.trim() : "",
            state: state ? state.trim() : "",
            isActive: isActive !== false
        });
        res.status(201).json({ success: true, message: "College/Campus created successfully", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "College with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateCampus = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, city, state, code, isActive } = req.body;
        const item = await College.findByIdAndUpdate(
            id,
            {
                name: name ? name.trim() : undefined,
                code: code !== undefined ? code.trim() : undefined,
                city: city !== undefined ? city.trim() : undefined,
                state: state !== undefined ? state.trim() : undefined,
                isActive
            },
            { returnDocument: 'after' }
        );
        res.status(200).json({ success: true, message: "College/Campus updated successfully", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "College with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminDeleteCampus = async (req, res) => {
    try {
        const { id } = req.params;
        await College.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "College/Campus deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Departments CRUD (Completely Independent)
exports.adminGetDepartments = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        let filter = {};
        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [{ name: searchRegex }, { code: searchRegex }];
        }

        const list = await Department.find(filter).sort({ name: 1 }).lean();
        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateDepartment = async (req, res) => {
    try {
        const { name, code, isActive } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: "Department name is required" });

        const item = await Department.create({
            name: name.trim(),
            code: code ? code.trim() : "",
            isActive: isActive !== false
        });
        res.status(201).json({ success: true, message: "Department created successfully", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Department with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, isActive } = req.body;
        const item = await Department.findByIdAndUpdate(
            id,
            {
                name: name ? name.trim() : undefined,
                code: code !== undefined ? code.trim() : undefined,
                isActive
            },
            { returnDocument: 'after' }
        );
        res.status(200).json({ success: true, message: "Department updated successfully", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Department with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminDeleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        await Department.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Department deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Branches CRUD (Completely Independent)
exports.adminGetBranches = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        let filter = {};
        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [{ name: searchRegex }, { degree: searchRegex }];
        }

        const list = await Branch.find(filter).sort({ name: 1 }).lean();
        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateBranch = async (req, res) => {
    try {
        const { name, degree, isActive } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: "Branch name is required" });

        const item = await Branch.create({
            name: name.trim(),
            degree: degree ? degree.trim() : "",
            isActive: isActive !== false
        });
        res.status(201).json({ success: true, message: "Branch created successfully", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Branch with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, degree, isActive } = req.body;
        const item = await Branch.findByIdAndUpdate(
            id,
            {
                name: name ? name.trim() : undefined,
                degree: degree !== undefined ? degree.trim() : undefined,
                isActive
            },
            { returnDocument: 'after' }
        );
        res.status(200).json({ success: true, message: "Branch updated successfully", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Branch with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminDeleteBranch = async (req, res) => {
    try {
        const { id } = req.params;
        await Branch.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Branch deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
