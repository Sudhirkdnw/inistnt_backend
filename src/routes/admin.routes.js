const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requirePermission = require("../middlewares/permission.middleware");

const {
    getDashboard, getAllUsers, getUserDetails, toggleBan, changeRole, deleteUser, restoreUser,
    getAllConfessions, toggleHideConfession, deleteAnyConfession,
    getReports, updateReport, getAnalytics,
    getPendingVerifications, handleVerification,
    getAllDatingProfiles, handleDatingProfile,
    getAuditLogs,
    getSettings, updateSetting,
    flushRedis, resetAllPasswords, broadcastAnnouncement,
    uploadSystemAsset,
    getEmailLogs, getEmailTemplates, updateEmailTemplate, sendTestEmail,
    getMailConfig, updateMailConfig,
    exportUsers, bulkDeleteUsers, bulkDeleteConfessions, bulkConfessionsModeration,
    exportReports, bulkReportsModeration, bulkHandleVerifications,
    getColleges, addCollege, updateCollege, deleteCollege, bulkUploadColleges,
    getAdmins, createAdmin, updateAdmin, deleteAdmin
} = require("../controllers/admin.controller");

const {
    getRoles,
    createRole,
    updateRole,
    deleteRole
} = require("../controllers/adminRole.controller");

const {
    getSessions: getSecuritySessions,
    revokeSession: revokeSecuritySession,
    getSecurityDashboard
} = require("../controllers/adminSecurity.controller");

const {
    getSettings: getPremiumSettings,
    updateSettings: updatePremiumSettings,
    createPlan: createPremiumPlan,
    updatePlan: updatePremiumPlan,
    deletePlan: deletePremiumPlan,
    grantPremiumManual,
    revokePremiumManual,
    cancelSubscriptionAdmin,
    getSubscribers: getPremiumSubscribers,
    getPremiumAnalytics
} = require("../controllers/adminPremium.controller");

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

router.get("/dashboard", getDashboard);

// User Management Module
router.get("/users", requirePermission("userManagement", "view"), getAllUsers);
router.get("/users/export", requirePermission("userManagement", "view"), exportUsers);
router.post("/users/bulk-delete", requirePermission("userManagement", "delete"), bulkDeleteUsers);
router.get("/users/:id", requirePermission("userManagement", "view"), getUserDetails);
router.put("/users/:id/ban", requirePermission("userManagement", "update"), toggleBan);
router.put("/users/:id/role", requirePermission("userManagement", "update"), changeRole);
router.delete("/users/:id", requirePermission("userManagement", "delete"), deleteUser);
router.post("/users/:id/restore", requirePermission("userManagement", "update"), restoreUser);

// Confessions Module
router.get("/confessions", requirePermission("posts", "view"), getAllConfessions);
router.post("/confessions/bulk-delete", requirePermission("posts", "delete"), bulkDeleteConfessions);
router.post("/confessions/bulk-moderation", requirePermission("posts", "update"), bulkConfessionsModeration);
router.put("/confessions/:id/hide", requirePermission("posts", "update"), toggleHideConfession);
router.delete("/confessions/:id", requirePermission("posts", "delete"), deleteAnyConfession);

// Reports Module
router.get("/reports", requirePermission("reports", "view"), getReports);
router.get("/reports/export", requirePermission("reports", "view"), exportReports);
router.post("/reports/bulk-moderation", requirePermission("reports", "update"), bulkReportsModeration);
router.put("/reports/:id", requirePermission("reports", "update"), updateReport);

// Analytics & Logs Module
router.get("/analytics", requirePermission("analytics", "view"), getAnalytics);
router.get("/audit-logs", requirePermission("analytics", "view"), getAuditLogs);

// Verification Requests Module
router.get("/verifications", requirePermission("verificationRequests", "view"), getPendingVerifications);
router.post("/verifications/bulk-handle", requirePermission("verificationRequests", "update"), bulkHandleVerifications);
router.put("/verifications/:id", requirePermission("verificationRequests", "update"), handleVerification);

// Dating Module
router.get("/dating/profiles", requirePermission("dating", "view"), getAllDatingProfiles);
router.put("/dating/profiles/:id", requirePermission("dating", "update"), handleDatingProfile);

// Admin Management Module
router.get("/admins", requirePermission("userManagement", "view"), getAdmins);
router.post("/admins", requirePermission("userManagement", "create"), createAdmin);
router.put("/admins/:id", requirePermission("userManagement", "update"), updateAdmin);
router.delete("/admins/:id", requirePermission("userManagement", "delete"), deleteAdmin);

// Session Security Module
router.get("/security/sessions", requirePermission("analytics", "view"), getSecuritySessions);
router.post("/security/sessions/revoke", requirePermission("userManagement", "update"), revokeSecuritySession);
router.get("/security/dashboard", requirePermission("analytics", "view"), getSecurityDashboard);

// Roles Management Module
router.get("/roles", requirePermission("userManagement", "view"), getRoles);
router.post("/roles", requirePermission("userManagement", "create"), createRole);
router.put("/roles/:id", requirePermission("userManagement", "update"), updateRole);
router.delete("/roles/:id", requirePermission("userManagement", "delete"), deleteRole);

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Colleges Management
router.get("/colleges", requirePermission("userManagement", "view"), getColleges);
router.post("/colleges", requirePermission("userManagement", "create"), addCollege);
router.post("/colleges/bulk", upload.single("file"), requirePermission("userManagement", "create"), bulkUploadColleges);
router.put("/colleges/:id", requirePermission("userManagement", "update"), updateCollege);
router.delete("/colleges/:id", requirePermission("userManagement", "delete"), deleteCollege);

// System Settings
router.get("/settings", requirePermission("userManagement", "view"), getSettings);
router.put("/settings/:key", requirePermission("userManagement", "update"), updateSetting);
router.post("/settings/upload-asset", upload.single("file"), requirePermission("userManagement", "update"), uploadSystemAsset);

// Mail Management
router.get("/mail/logs", requirePermission("analytics", "view"), getEmailLogs);
router.get("/mail/templates", requirePermission("userManagement", "view"), getEmailTemplates);
router.put("/mail/templates/:id", requirePermission("userManagement", "update"), updateEmailTemplate);
router.get("/mail/config", requirePermission("userManagement", "view"), getMailConfig);
router.put("/mail/config", requirePermission("userManagement", "update"), updateMailConfig);
router.post("/mail/send-test", requirePermission("userManagement", "update"), sendTestEmail);

// Danger Zone Actions
router.post("/danger/flush-redis", requirePermission("analytics", "update"), flushRedis);
router.post("/danger/reset-passwords", requirePermission("userManagement", "update"), resetAllPasswords);
router.post("/danger/broadcast", requirePermission("userManagement", "update"), broadcastAnnouncement);

// Premium Subscription Management
router.get("/premium/settings", requirePermission("premium", "view"), getPremiumSettings);
router.put("/premium/settings", requirePermission("premium", "update"), updatePremiumSettings);
router.post("/premium/plans", requirePermission("premium", "create"), createPremiumPlan);
router.put("/premium/plans/:id", requirePermission("premium", "update"), updatePremiumPlan);
router.delete("/premium/plans/:id", requirePermission("premium", "delete"), deletePremiumPlan);
router.post("/premium/grant", requirePermission("premium", "update"), grantPremiumManual);
router.post("/premium/revoke", requirePermission("premium", "update"), revokePremiumManual);
router.post("/premium/cancel-subscription", requirePermission("premium", "update"), cancelSubscriptionAdmin);
router.get("/premium/subscribers", requirePermission("premium", "view"), getPremiumSubscribers);
router.get("/premium/analytics", requirePermission("premium", "view"), getPremiumAnalytics);

module.exports = router;
