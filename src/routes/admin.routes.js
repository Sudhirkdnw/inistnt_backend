const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

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
    getColleges, addCollege, updateCollege, deleteCollege, bulkUploadColleges
} = require("../controllers/admin.controller");

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

router.get("/dashboard", getDashboard);
router.get("/users", getAllUsers);
router.get("/users/export", exportUsers);
router.post("/users/bulk-delete", bulkDeleteUsers);
router.get("/users/:id", getUserDetails);
router.put("/users/:id/ban", toggleBan);
router.put("/users/:id/role", changeRole);
router.delete("/users/:id", deleteUser);
router.post("/users/:id/restore", restoreUser);

router.get("/confessions", getAllConfessions);
router.post("/confessions/bulk-delete", bulkDeleteConfessions);
router.post("/confessions/bulk-moderation", bulkConfessionsModeration);
router.put("/confessions/:id/hide", toggleHideConfession);
router.delete("/confessions/:id", deleteAnyConfession);

router.get("/reports", getReports);
router.get("/reports/export", exportReports);
router.post("/reports/bulk-moderation", bulkReportsModeration);
router.put("/reports/:id", updateReport);

router.get("/analytics", getAnalytics);

router.get("/verifications", getPendingVerifications);
router.post("/verifications/bulk-handle", bulkHandleVerifications);
router.put("/verifications/:id", handleVerification);

router.get("/dating/profiles", getAllDatingProfiles);
router.put("/dating/profiles/:id", handleDatingProfile);

router.get("/audit-logs", getAuditLogs);

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get("/colleges", getColleges);
router.post("/colleges", addCollege);
router.post("/colleges/bulk", upload.single("file"), bulkUploadColleges);
router.put("/colleges/:id", updateCollege);
router.delete("/colleges/:id", deleteCollege);

router.get("/settings", getSettings);
router.put("/settings/:key", updateSetting);
router.post("/settings/upload-asset", upload.single("file"), uploadSystemAsset);

// Mail Management
router.get("/mail/logs", getEmailLogs);
router.get("/mail/templates", getEmailTemplates);
router.put("/mail/templates/:id", updateEmailTemplate);
router.get("/mail/config", getMailConfig);
router.put("/mail/config", updateMailConfig);
router.post("/mail/send-test", sendTestEmail);

// Danger Zone Actions
router.post("/danger/flush-redis", flushRedis);
router.post("/danger/reset-passwords", resetAllPasswords);
router.post("/danger/broadcast", broadcastAnnouncement);

module.exports = router;
