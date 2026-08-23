const University = require("../models/university.model");
const College = require("../models/college.model");
const Department = require("../models/department.model");
const Branch = require("../models/branch.model");
const mongoose = require("mongoose");

// ─── PUBLIC AUTOCOMPLETE & DIRECTORY ENDPOINTS ───────────────────────────────────

// GET /api/hierarchy/universities?q=&limit=
exports.getUniversities = async (req, res) => {
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
                { state: searchRegex }
            ];
        }

        const list = await University.find(filter)
            .select("name city state isActive")
            .sort({ name: 1 })
            .limit(limit)
            .lean();

        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /api/hierarchy/campuses?q=&universityId= or /api/hierarchy/universities/:universityId/campuses
exports.getCampuses = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const rawUni = req.params.universityId || req.query.universityId || req.query.university;
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);
        const filter = { isActive: true };

        if (rawUni && rawUni.trim()) {
            const uniTrimmed = rawUni.trim();
            if (mongoose.Types.ObjectId.isValid(uniTrimmed)) {
                filter.university = new mongoose.Types.ObjectId(uniTrimmed);
            } else {
                // If passed as name, find the university first
                const uniDoc = await University.findOne({
                    name: new RegExp(`^${uniTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                    isActive: true
                }).select("_id");
                if (uniDoc) {
                    filter.university = uniDoc._id;
                } else {
                    return res.status(200).json({ success: true, list: [] });
                }
            }
        }

        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, "i");
            const searchConditions = [
                { name: searchRegex },
                { city: searchRegex },
                { state: searchRegex },
                { code: searchRegex }
            ];
            if (filter.university) {
                filter.$and = [{ university: filter.university }, { $or: searchConditions }];
                delete filter.university;
            } else {
                filter.$or = searchConditions;
            }
        }

        const list = await College.find(filter)
            .select("name code city state university isActive")
            .populate("university", "name _id")
            .sort({ name: 1 })
            .limit(limit)
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

// Campuses / Colleges CRUD
exports.adminGetCampuses = async (req, res) => {
    try {
        const query = (req.query.q || "").trim();
        const rawUni = req.query.universityId || req.query.university;
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

        const list = await College.find(filter)
            .populate("university", "name _id city state isActive")
            .sort({ name: 1 })
            .lean();
        res.status(200).json({ success: true, list });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.adminCreateCampus = async (req, res) => {
    try {
        const { name, city, state, code, isActive, university, universityId } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: "College/Campus name is required" });

        let resolvedUni = null;
        const targetUni = universityId || university;
        if (targetUni && mongoose.Types.ObjectId.isValid(targetUni)) {
            resolvedUni = targetUni;
        } else if (targetUni && typeof targetUni === "string" && targetUni.trim()) {
            const foundUni = await University.findOne({ name: new RegExp(`^${targetUni.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
            if (foundUni) resolvedUni = foundUni._id;
        }

        const item = await College.create({
            name: name.trim(),
            university: resolvedUni,
            code: code ? code.trim() : "",
            city: city ? city.trim() : "",
            state: state ? state.trim() : "",
            isActive: isActive !== false
        });

        const populated = await College.findById(item._id).populate("university", "name _id");
        res.status(201).json({ success: true, message: "College/Campus created successfully", item: populated });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "College with this name already exists" });
        res.status(500).json({ message: err.message });
    }
};

exports.adminUpdateCampus = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, city, state, code, isActive, university, universityId } = req.body;

        const updateData = {
            name: name ? name.trim() : undefined,
            code: code !== undefined ? code.trim() : undefined,
            city: city !== undefined ? city.trim() : undefined,
            state: state !== undefined ? state.trim() : undefined,
            isActive
        };

        const targetUni = universityId !== undefined ? universityId : university;
        if (targetUni !== undefined) {
            if (!targetUni || targetUni === "none" || targetUni === "null") {
                updateData.university = null;
            } else if (mongoose.Types.ObjectId.isValid(targetUni)) {
                updateData.university = targetUni;
            } else if (typeof targetUni === "string" && targetUni.trim()) {
                const foundUni = await University.findOne({ name: new RegExp(`^${targetUni.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
                if (foundUni) updateData.university = foundUni._id;
            }
        }

        const item = await College.findByIdAndUpdate(
            id,
            updateData,
            { returnDocument: 'after' }
        ).populate("university", "name _id");

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

        const uniOps = [];
        const collegeOps = [];
        const deptOps = [];
        const branchOps = [];

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

            const isActive = rowData.isactive !== undefined && rowData.isactive !== "" 
                ? (rowData.isactive.toLowerCase() !== "false" && rowData.isactive !== "0") 
                : true;

            if (rowType.includes("uni")) {
                uniOps.push({
                    updateOne: {
                        filter: { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                        update: {
                            $set: {
                                name,
                                city: rowData.city || "",
                                state: rowData.state || "",
                                isActive
                            }
                        },
                        upsert: true
                    }
                });
            } else if (rowType.includes("camp") || rowType.includes("coll") || rowType.includes("inst")) {
                const uniName = rowData.university || rowData.universityname || rowData.univ || "";
                let uniId = null;
                if (uniName) {
                    if (mongoose.Types.ObjectId.isValid(uniName)) {
                        uniId = new mongoose.Types.ObjectId(uniName);
                    }
                }

                const collegeSet = {
                    name,
                    code: rowData.code || "",
                    city: rowData.city || "",
                    state: rowData.state || "",
                    isActive
                };
                if (uniId) collegeSet.university = uniId;

                collegeOps.push({
                    updateOne: {
                        filter: { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                        update: { $set: collegeSet },
                        upsert: true
                    }
                });
            } else if (rowType.includes("dept") || rowType.includes("depart") || rowType.includes("school") || rowType.includes("facult")) {
                deptOps.push({
                    updateOne: {
                        filter: { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                        update: {
                            $set: {
                                name,
                                code: rowData.code || "",
                                isActive
                            }
                        },
                        upsert: true
                    }
                });
            } else if (rowType.includes("branch") || rowType.includes("course") || rowType.includes("major") || rowType.includes("prog") || rowType.includes("spec")) {
                branchOps.push({
                    updateOne: {
                        filter: { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                        update: {
                            $set: {
                                name,
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

        // Execute bulkWrite in parallel for each category
        const [uniRes, collegeRes, deptRes, branchRes] = await Promise.all([
            uniOps.length > 0 ? University.bulkWrite(uniOps, { ordered: false }) : null,
            collegeOps.length > 0 ? College.bulkWrite(collegeOps, { ordered: false }) : null,
            deptOps.length > 0 ? Department.bulkWrite(deptOps, { ordered: false }) : null,
            branchOps.length > 0 ? Branch.bulkWrite(branchOps, { ordered: false }) : null
        ]);

        const calcUpserts = (resObj) => {
            if (!resObj) return 0;
            return (resObj.upsertedCount || 0) + (resObj.modifiedCount || 0) + (resObj.matchedCount || 0);
        };

        importedCount = calcUpserts(uniRes) + calcUpserts(collegeRes) + calcUpserts(deptRes) + calcUpserts(branchRes);

        res.status(200).json({
            success: true,
            message: `Successfully processed CSV. Imported/Updated ${importedCount} items (${skippedCount} skipped).`,
            importedCount,
            skippedCount,
            breakdown: {
                universities: calcUpserts(uniRes),
                colleges: calcUpserts(collegeRes),
                departments: calcUpserts(deptRes),
                branches: calcUpserts(branchRes)
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

        if (category === "universities" || category === "university") {
            const list = await University.find().sort({ name: 1 }).lean();
            csvContent = "Name,City,State,isActive\n";
            list.forEach(u => {
                csvContent += `${escapeCSV(u.name)},${escapeCSV(u.city)},${escapeCSV(u.state)},${u.isActive !== false}\n`;
            });
            filename = `hykee_universities_export_${Date.now()}.csv`;
        } else if (category === "campuses" || category === "colleges" || category === "college") {
            const list = await College.find().populate("university", "name").sort({ name: 1 }).lean();
            csvContent = "Name,University,Code,City,State,isActive\n";
            list.forEach(c => {
                const uName = c.university?.name || "";
                csvContent += `${escapeCSV(c.name)},${escapeCSV(uName)},${escapeCSV(c.code)},${escapeCSV(c.city)},${escapeCSV(c.state)},${c.isActive !== false}\n`;
            });
            filename = `hykee_colleges_export_${Date.now()}.csv`;
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
            const [unis, colleges, depts, branches] = await Promise.all([
                University.find().sort({ name: 1 }).lean(),
                College.find().populate("university", "name").sort({ name: 1 }).lean(),
                Department.find().sort({ name: 1 }).lean(),
                Branch.find().sort({ name: 1 }).lean()
            ]);

            csvContent = "Type,Name,University,Code,City,State,Degree,isActive\n";
            unis.forEach(u => {
                csvContent += `University,${escapeCSV(u.name)},,,${escapeCSV(u.city)},${escapeCSV(u.state)},,${u.isActive !== false}\n`;
            });
            colleges.forEach(c => {
                const uName = c.university?.name || "";
                csvContent += `College,${escapeCSV(c.name)},${escapeCSV(uName)},${escapeCSV(c.code)},${escapeCSV(c.city)},${escapeCSV(c.state)},,${c.isActive !== false}\n`;
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

