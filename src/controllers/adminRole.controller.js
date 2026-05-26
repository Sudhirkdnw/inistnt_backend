const roleModel = require("../models/role.model");
const userModel = require("../models/user.model");
const auditLogModel = require("../models/auditLog.model");

const logAudit = async (adminId, action, options = {}) => {
    try {
        await auditLogModel.create({
            admin: adminId,
            action,
            targetUser: options.targetUser,
            details: options.details,
            ipAddress: options.ipAddress,
            previousValues: options.previousValues,
            updatedValues: options.updatedValues
        });
    } catch (err) {
        console.error("Audit log failed:", err.message);
    }
};

const getRoles = async (req, res) => {
    try {
        const roles = await roleModel.find().populate("createdBy", "username fullName email");
        return res.status(200).json({ success: true, data: roles });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const createRole = async (req, res) => {
    try {
        const { name, description, permissions } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: "Role name is required" });
        }

        const existingRole = await roleModel.findOne({ name: name.trim() });
        if (existingRole) {
            return res.status(400).json({ success: false, message: "Role name already exists" });
        }

        const role = await roleModel.create({
            name: name.trim(),
            description: description || "",
            permissions: permissions || {},
            createdBy: req.user._id
        });

        await logAudit(req.user._id, "CREATE_ROLE", {
            details: `Created custom role: ${role.name}`,
            ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
            updatedValues: role.toObject()
        });

        return res.status(201).json({ success: true, data: role });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, permissions } = req.body;

        const role = await roleModel.findById(id);
        if (!role) {
            return res.status(404).json({ success: false, message: "Role not found" });
        }

        if (name && name.trim() !== role.name) {
            const existingRole = await roleModel.findOne({ name: name.trim() });
            if (existingRole && existingRole._id.toString() !== id) {
                return res.status(400).json({ success: false, message: "Role name already exists" });
            }
        }

        const previousValues = role.toObject();

        if (name) role.name = name.trim();
        if (description !== undefined) role.description = description;
        if (permissions) role.permissions = permissions;

        await role.save();

        await logAudit(req.user._id, "UPDATE_ROLE", {
            details: `Updated custom role: ${role.name}`,
            ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
            previousValues,
            updatedValues: role.toObject()
        });

        return res.status(200).json({ success: true, data: role });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteRole = async (req, res) => {
    try {
        const { id } = req.params;

        const role = await roleModel.findById(id);
        if (!role) {
            return res.status(404).json({ success: false, message: "Role not found" });
        }

        const previousValues = role.toObject();

        // Remove references from users having this role
        await userModel.updateMany({ roleRef: id }, { roleRef: null });

        await roleModel.findByIdAndDelete(id);

        await logAudit(req.user._id, "DELETE_ROLE", {
            details: `Deleted custom role: ${role.name}`,
            ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
            previousValues
        });

        return res.status(200).json({ success: true, message: "Role deleted successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getRoles,
    createRole,
    updateRole,
    deleteRole
};
