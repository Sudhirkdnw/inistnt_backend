const userModel = require("../models/user.model");

/**
 * Enterprise Route Authorization Middleware Factory
 * Checks dynamic permission matrix for non-superadmin users
 * 
 * @param {string} moduleName - Name of the module (e.g., 'userManagement', 'reports', 'dating', 'premium')
 * @param {string} action - Action requested ('view', 'create', 'update', 'delete')
 */
function requirePermission(moduleName, action) {
    return async (req, res, next) => {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Block banned users instantly
        if (user.isBanned) {
            return res.status(403).json({ message: "Your account has been banned" });
        }

        // Ensure user role is admin
        if (user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required" });
        }

        // Super Admin bypasses all checks
        if (user.adminRole === "superadmin") {
            return next();
        }

        let permissions = user.adminPermissions || {};

        // Resolve custom role permissions if roleRef exists
        if (user.roleRef) {
            try {
                const populatedUser = await userModel.findById(user._id).populate("roleRef");
                if (populatedUser && populatedUser.roleRef) {
                    permissions = populatedUser.roleRef.permissions || {};
                }
            } catch (err) {
                console.error("Error populating admin roleRef in requirePermission middleware:", err);
            }
        }

        const modulePermissions = permissions[moduleName] || {};
        
        if (modulePermissions[action] === true) {
            return next();
        }

        return res.status(403).json({ 
            message: `Forbidden: You do not have permissions to ${action} in the ${moduleName} module.` 
        });
    };
}

module.exports = requirePermission;
