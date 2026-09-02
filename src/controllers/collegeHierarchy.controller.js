// No longer importing University model for user-facing queries
// University model kept for legacy/admin read-only access only
const University = require("../models/university.model");
const College = require("../models/college.model");
const Department = require("../models/department.model");
const Branch = require("../models/branch.model");
const mongoose = require("mongoose");

// ─── UNIFIED INSTITUTION SEARCH ─────────────────────────────────────────────
// All institutions (colleges, universities, IITs, NITs, etc.) are in the College collection.
// The "University" collection is legacy/admin-only and NOT used for user-facing dropdowns.

// GET /api/hierarchy/universities?q=&limit=
// @alias — now returns from College collection (unified institution list)
exports.getUniversities = async (req, res) => {
    // Redirect to unified College search — same as getCampuses
    return exports.getCampuses(req, res);
};

// GET /api/hierarchy/campuses?q=&limit=  (also aliased as /colleges)
// @unified — searches College collection only, no University dependency
exports.getCampuses = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);

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
            .select("name code city state instituteType isActive")
            .sort({ name: 1 })
            .limit(limit)
            .lean();

        res.status(200).json({ success: true, list });
    } catch (err) {
        console.error("Error in getCampuses:", err);
        res.status(500).json({ message: err.message });
    }
};


// GET /api/hierarchy/departments?q=
exports.getDepartments = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);
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
            .limit(limit)
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
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);
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
            .limit(limit)
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
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = req.query.limit === 'all' ? 0 : Math.min(parseInt(req.query.limit) || 25, 200);

        let filter = {};
        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [{ name: searchRegex }, { city: searchRegex }, { state: searchRegex }];
        }

        const [total, activeCount, list] = await Promise.all([
            University.countDocuments(filter),
            University.countDocuments({ ...filter, isActive: true }),
            University.find(filter)
                .sort({ name: 1 })
                .skip(limit > 0 ? (page - 1) * limit : 0)
                .limit(limit > 0 ? limit : 0)
                .lean()
        ]);

        const pages = limit > 0 ? Math.ceil(total / limit) || 1 : 1;

        res.status(200).json({
            success: true,
            list,
            total,
            activeCount,
            pagination: {
                page,
                limit: limit > 0 ? limit : total,
                total,
                pages
            }
        });
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

// Campuses / Colleges CRUD
exports.adminGetCampuses = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const rawUni = req.query.universityId || req.query.university;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = req.query.limit === 'all' ? 0 : Math.min(parseInt(req.query.limit) || 25, 200);
        let filter = {};

        if (rawUni && rawUni.trim()) {
            const uniTrimmed = rawUni.trim();
            if (mongoose.Types.ObjectId.isValid(uniTrimmed)) {
                filter.university = new mongoose.Types.ObjectId(uniTrimmed);
            }
        }

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            const searchConditions = [{ name: searchRegex }, { city: searchRegex }, { state: searchRegex }, { code: searchRegex }];
            if (filter.university) {
                filter.$and = [{ university: filter.university }, { $or: searchConditions }];
                delete filter.university;
            } else {
                filter.$or = searchConditions;
            }
        }

        const [total, activeCount, list] = await Promise.all([
            College.countDocuments(filter),
            College.countDocuments({ ...filter, isActive: true }),
            College.find(filter)
                .populate("university", "name _id city state isActive")
                .sort({ name: 1 })
                .skip(limit > 0 ? (page - 1) * limit : 0)
                .limit(limit > 0 ? limit : 0)
                .lean()
        ]);

        const pages = limit > 0 ? Math.ceil(total / limit) || 1 : 1;

        res.status(200).json({
            success: true,
            list,
            total,
            activeCount,
            pagination: {
                page,
                limit: limit > 0 ? limit : total,
                total,
                pages
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateCampus = async (req, res) => {
    try {
        const { name, city, state, code, isActive, instituteType } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: "College/Institution name is required" });

        const cleanName = name.replace(/\s+/g, ' ').trim();
        const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existing = await College.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
        if (existing) {
            return res.status(400).json({ message: `An institution with the name "${cleanName}" already exists` });
        }

        const item = await College.create({
            name: cleanName,
            instituteType: instituteType || "college",
            code: code ? code.trim() : "",
            city: city ? city.trim() : "",
            state: state ? state.trim() : "",
            isActive: isActive !== false
        });

        res.status(201).json({ success: true, message: "Institution added to unified college list", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "An institution with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateCampus = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, city, state, code, isActive, instituteType } = req.body;

        const updateData = {
            code: code !== undefined ? code.trim() : undefined,
            city: city !== undefined ? city.trim() : undefined,
            state: state !== undefined ? state.trim() : undefined,
            isActive
        };

        if (name) {
            const cleanName = name.replace(/\s+/g, ' ').trim();
            const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const existing = await College.findOne({ _id: { $ne: id }, name: new RegExp(`^${escaped}$`, 'i') });
            if (existing) {
                return res.status(400).json({ message: `Another institution with the name "${cleanName}" already exists` });
            }
            updateData.name = cleanName;
        }

        if (instituteType) updateData.instituteType = instituteType;

        const item = await College.findByIdAndUpdate(
            id,
            updateData,
            { returnDocument: 'after' }
        );

        res.status(200).json({ success: true, message: "Institution updated successfully", item });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "An institution with this name already exists" });
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
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = req.query.limit === 'all' ? 0 : Math.min(parseInt(req.query.limit) || 25, 200);
        let filter = {};

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [{ name: searchRegex }, { code: searchRegex }];
        }

        const [total, activeCount, list] = await Promise.all([
            Department.countDocuments(filter),
            Department.countDocuments({ ...filter, isActive: true }),
            Department.find(filter)
                .sort({ name: 1 })
                .skip(limit > 0 ? (page - 1) * limit : 0)
                .limit(limit > 0 ? limit : 0)
                .lean()
        ]);

        const pages = limit > 0 ? Math.ceil(total / limit) || 1 : 1;

        res.status(200).json({
            success: true,
            list,
            total,
            activeCount,
            pagination: {
                page,
                limit: limit > 0 ? limit : total,
                total,
                pages
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateDepartment = async (req, res) => {
    try {
        const { name, code, isActive } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: "Department name is required" });

        const cleanName = name.replace(/\s+/g, ' ').trim();
        const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existing = await Department.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
        if (existing) {
            return res.status(400).json({ message: `A department with the name "${cleanName}" already exists` });
        }

        const item = await Department.create({
            name: cleanName,
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

        const updateData = {
            code: code !== undefined ? code.trim() : undefined,
            isActive
        };

        if (name) {
            const cleanName = name.replace(/\s+/g, ' ').trim();
            const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const existing = await Department.findOne({ _id: { $ne: id }, name: new RegExp(`^${escaped}$`, 'i') });
            if (existing) {
                return res.status(400).json({ message: `Another department with the name "${cleanName}" already exists` });
            }
            updateData.name = cleanName;
        }

        const item = await Department.findByIdAndUpdate(
            id,
            updateData,
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
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = req.query.limit === 'all' ? 0 : Math.min(parseInt(req.query.limit) || 25, 200);
        let filter = {};

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            filter.$or = [{ name: searchRegex }, { degree: searchRegex }];
        }

        const [total, activeCount, list] = await Promise.all([
            Branch.countDocuments(filter),
            Branch.countDocuments({ ...filter, isActive: true }),
            Branch.find(filter)
                .sort({ name: 1 })
                .skip(limit > 0 ? (page - 1) * limit : 0)
                .limit(limit > 0 ? limit : 0)
                .lean()
        ]);

        const pages = limit > 0 ? Math.ceil(total / limit) || 1 : 1;

        res.status(200).json({
            success: true,
            list,
            total,
            activeCount,
            pagination: {
                page,
                limit: limit > 0 ? limit : total,
                total,
                pages
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateBranch = async (req, res) => {
    try {
        const { name, degree, isActive } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: "Branch name is required" });

        const cleanName = name.replace(/\s+/g, ' ').trim();
        const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existing = await Branch.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
        if (existing) {
            return res.status(400).json({ message: `A branch with the name "${cleanName}" already exists` });
        }

        const item = await Branch.create({
            name: cleanName,
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

        const updateData = {
            degree: degree !== undefined ? degree.trim() : undefined,
            isActive
        };

        if (name) {
            const cleanName = name.replace(/\s+/g, ' ').trim();
            const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const existing = await Branch.findOne({ _id: { $ne: id }, name: new RegExp(`^${escaped}$`, 'i') });
            if (existing) {
                return res.status(400).json({ message: `Another branch with the name "${cleanName}" already exists` });
            }
            updateData.name = cleanName;
        }

        const item = await Branch.findByIdAndUpdate(
            id,
            updateData,
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

/**
 * CSV Line Parser supporting quoted fields with commas
 */
function parseCSVRow(text) {
    const p = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (inQuote && text[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (c === ',' && !inQuote) {
            p.push(cur.trim());
            cur = '';
        } else {
            cur += c;
        }
    }
    p.push(cur.trim());
    return p;
}

// ── BULK CSV UPLOAD ENGINE ──────────────────────────────────────────────────
exports.adminBulkUploadCSV = async (req, res) => {
    try {
        let csvContent = "";
        const category = (req.params.category || req.body.category || "unified").toLowerCase();

        if (req.file) {
            csvContent = req.file.buffer.toString("utf-8");
        } else if (req.body.csvData) {
            csvContent = req.body.csvData;
        } else {
            return res.status(400).json({ message: "CSV file or raw CSV data is required" });
        }

        const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
            return res.status(400).json({ message: "CSV file is empty or missing headers" });
        }

        const rawHeaders = parseCSVRow(lines[0]);
        const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

        let importedCount = 0;
        let skippedCount = 0;
        const errors = [];

        const collegeOps = [];
        const deptOps = [];
        const branchOps = [];

        const seenColleges = new Set();
        const seenDepts = new Set();
        const seenBranches = new Set();

        for (let i = 1; i < lines.length; i++) {
            const row = parseCSVRow(lines[i]);
            if (row.length === 0 || (row.length === 1 && !row[0])) continue;

            const rowData = {};
            headers.forEach((h, idx) => {
                rowData[h] = row[idx] ? row[idx].trim() : "";
            });

            const rowType = (rowData.type || category).toLowerCase();
            const name = rowData.name || rowData.title || rowData.collegename || rowData.universityname || rowData.departmentname || rowData.branchname || rowData.coursename || rowData.course;

            if (!name) {
                skippedCount++;
                errors.push(`Row ${i + 1}: Missing name field`);
                continue;
            }

            const cleanName = name.trim();
            const nameKey = cleanName.toLowerCase();

            const isActive = rowData.isactive !== undefined && rowData.isactive !== "" 
                ? (rowData.isactive.toLowerCase() !== "false" && rowData.isactive !== "0") 
                : true;

            if (rowType.includes("uni") || rowType.includes("camp") || rowType.includes("coll") || rowType.includes("inst")) {
                if (seenColleges.has(nameKey)) continue;
                seenColleges.add(nameKey);

                const inferredType = rowData.institutetype || rowData.type || (rowType.includes("uni") ? "university" : rowType.includes("inst") ? "institute" : "college");
                const collegeSet = {
                    name: cleanName,
                    instituteType: inferredType,
                    code: rowData.code || "",
                    city: rowData.city || "",
                    state: rowData.state || "",
                    isActive
                };

                collegeOps.push({
                    updateOne: {
                        filter: { name: cleanName },
                        update: { $set: collegeSet },
                        upsert: true
                    }
                });
            } else if (rowType.includes("dept") || rowType.includes("depart") || rowType.includes("school") || rowType.includes("facult")) {
                if (seenDepts.has(nameKey)) continue;
                seenDepts.add(nameKey);

                deptOps.push({
                    updateOne: {
                        filter: { name: cleanName },
                        update: {
                            $set: {
                                name: cleanName,
                                code: rowData.code || "",
                                isActive
                            }
                        },
                        upsert: true
                    }
                });
            } else if (rowType.includes("branch") || rowType.includes("course") || rowType.includes("major") || rowType.includes("prog") || rowType.includes("spec")) {
                if (seenBranches.has(nameKey)) continue;
                seenBranches.add(nameKey);

                branchOps.push({
                    updateOne: {
                        filter: { name: cleanName },
                        update: {
                            $set: {
                                name: cleanName,
                                degree: rowData.degree || rowData.program || rowData.course || "",
                                isActive
                            }
                        },
                        upsert: true
                    }
                });
            } else {
                skippedCount++;
                errors.push(`Row ${i + 1}: Unknown type "${rowType}" for name "${name}"`);
            }
        }

        // Helper to execute bulkWrite in chunks (prevents MongoDB wire size / batch overflow on 50k+ items)
        const executeChunkedBulkWrite = async (model, ops, batchSize = 1000) => {
            if (!ops || ops.length === 0) return 0;
            let totalProcessed = 0;
            for (let i = 0; i < ops.length; i += batchSize) {
                const chunk = ops.slice(i, i + batchSize);
                try {
                    const res = await model.bulkWrite(chunk, { ordered: false });
                    totalProcessed += (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.matchedCount || 0) + (res.insertedCount || 0);
                } catch (err) {
                    if (err.result) {
                        totalProcessed += (err.result.nUpserted || err.result.upsertedCount || 0) + (err.result.nModified || err.result.modifiedCount || 0) + (err.result.nMatched || err.result.matchedCount || 0) + (err.result.nInserted || 0);
                    }
                }
            }
            return totalProcessed;
        };

        // Execute bulkWrite in parallel for each category with batching
        const [collegeCount, deptCount, branchCount] = await Promise.all([
            executeChunkedBulkWrite(College, collegeOps, 1000),
            executeChunkedBulkWrite(Department, deptOps, 1000),
            executeChunkedBulkWrite(Branch, branchOps, 1000)
        ]);

        importedCount = collegeCount + deptCount + branchCount;

        res.status(200).json({
            success: true,
            message: `Successfully processed CSV. Imported/Updated ${importedCount} items (${skippedCount} skipped).`,
            importedCount,
            skippedCount,
            breakdown: {
                colleges: collegeCount,
                departments: deptCount,
                branches: branchCount
            },
            errors: errors.slice(0, 10)
        });
    } catch (err) {
        console.error("Bulk CSV upload error:", err);
        res.status(500).json({ message: "Failed to process CSV: " + err.message });
    }
};

// ── BULK CSV EXPORT ENGINE ──────────────────────────────────────────────────
exports.adminExportCSV = async (req, res) => {
    try {
        const category = (req.params.category || req.query.category || "unified").toLowerCase();

        let csvContent = "";
        let filename = "";

        const escapeCSV = (str) => {
            if (str === null || str === undefined) return "";
            const s = String(str);
            if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        if (category === "universities" || category === "university" || category === "campuses" || category === "colleges" || category === "college") {
            const list = await College.find().sort({ name: 1 }).lean();
            csvContent = "Name,InstituteType,Code,City,State,isActive\n";
            list.forEach(c => {
                csvContent += `${escapeCSV(c.name)},${escapeCSV(c.instituteType || 'college')},${escapeCSV(c.code)},${escapeCSV(c.city)},${escapeCSV(c.state)},${c.isActive !== false}\n`;
            });
            filename = `hykee_institutions_export_${Date.now()}.csv`;
        } else if (category === "departments" || category === "department") {
            const list = await Department.find().sort({ name: 1 }).lean();
            csvContent = "Name,Code,isActive\n";
            list.forEach(d => {
                csvContent += `${escapeCSV(d.name)},${escapeCSV(d.code)},${d.isActive !== false}\n`;
            });
            filename = `hykee_departments_export_${Date.now()}.csv`;
        } else if (category === "branches" || category === "branch" || category === "courses" || category === "course") {
            const list = await Branch.find().sort({ name: 1 }).lean();
            csvContent = "Name,Degree,isActive\n";
            list.forEach(b => {
                csvContent += `${escapeCSV(b.name)},${escapeCSV(b.degree)},${b.isActive !== false}\n`;
            });
            filename = `hykee_courses_branches_export_${Date.now()}.csv`;
        } else {
            // Unified export of everything in one clean spreadsheet
            const [colleges, depts, branches] = await Promise.all([
                College.find().sort({ name: 1 }).lean(),
                Department.find().sort({ name: 1 }).lean(),
                Branch.find().sort({ name: 1 }).lean()
            ]);

            csvContent = "Type,Name,InstituteType,Code,City,State,Degree,isActive\n";
            colleges.forEach(c => {
                csvContent += `Institution,${escapeCSV(c.name)},${escapeCSV(c.instituteType || 'college')},${escapeCSV(c.code)},${escapeCSV(c.city)},${escapeCSV(c.state)},,${c.isActive !== false}\n`;
            });
            depts.forEach(d => {
                csvContent += `Department,${escapeCSV(d.name)},,${escapeCSV(d.code)},,,,${d.isActive !== false}\n`;
            });
            branches.forEach(b => {
                csvContent += `Branch,${escapeCSV(b.name)},,,,,${escapeCSV(b.degree)},${b.isActive !== false}\n`;
            });
            filename = `hykee_academic_directory_full_export_${Date.now()}.csv`;
        }

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.status(200).send(csvContent);
    } catch (err) {
        console.error("Export CSV error:", err);
        res.status(500).json({ message: "Failed to export CSV: " + err.message });
    }
};

