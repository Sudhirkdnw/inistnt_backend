const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requirePermission = require("../middlewares/permission.middleware");
const ccAdmin = require("../controllers/adminCampusConnect.controller");
const collegeHierarchyAdmin = require("../controllers/collegeHierarchy.controller");
const adminCommunityCtrl = require("../controllers/adminCommunity.controller");
const adminTeamCtrl = require("../controllers/adminTeam.controller");
const adCtrl = require("../controllers/advertisement.controller");

const {
    getDashboard, getAllUsers, getUserDetails, toggleBan, changeRole, deleteUser, restoreUser,
    updateUserStatus, updateUserVerification, forceLogoutUser, bulkUsersAction,
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
    getAdmins, createAdmin, updateAdmin, deleteAdmin,
    broadcastPushNotification, getGlobalNotificationHistory
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
    updateSubscriberAdmin,
    getSubscriberAudit,
    getPremiumAnalytics
} = require("../controllers/adminPremium.controller");

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

router.get("/dashboard", getDashboard);

// User Management Module
router.get("/users", requirePermission("userManagement", "view"), getAllUsers);
router.get("/users/export", requirePermission("userManagement", "view"), exportUsers);
router.post("/users/bulk-delete", requirePermission("userManagement", "delete"), bulkDeleteUsers);
router.post("/users/bulk-action", requirePermission("userManagement", "update"), bulkUsersAction);
router.get("/users/:id", requirePermission("userManagement", "view"), getUserDetails);
router.put("/users/:id/status", requirePermission("userManagement", "update"), updateUserStatus);
router.put("/users/:id/verify", requirePermission("userManagement", "update"), updateUserVerification);
router.post("/users/:id/revoke-sessions", requirePermission("userManagement", "update"), forceLogoutUser);
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

// Campus Connect User Moderation
router.get("/campus-connect/users", requirePermission("dating", "view"), ccAdmin.getCCUsers);
router.get("/campus-connect/users/:id", requirePermission("dating", "view"), ccAdmin.getCCUserDetail);
router.post("/campus-connect/users/:id/action", requirePermission("dating", "update"), ccAdmin.handleCCUserAction);


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

// Push Notifications
router.post("/notifications/broadcast", requirePermission("userManagement", "update"), broadcastPushNotification);
router.get("/notifications/history", requirePermission("userManagement", "view"), getGlobalNotificationHistory);

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
router.put("/premium/subscribers/:id", requirePermission("premium", "update"), updateSubscriberAdmin);
router.get("/premium/subscribers/:id/audit", requirePermission("premium", "view"), getSubscriberAudit);
router.get("/premium/analytics", requirePermission("premium", "view"), getPremiumAnalytics);

// Campus Connect Control Center
router.get("/campus-connect/stats", requirePermission("analytics", "view"), ccAdmin.getStats);
router.get("/campus-connect/charts", requirePermission("analytics", "view"), ccAdmin.getCharts);
router.get("/campus-connect/mentors", requirePermission("userManagement", "view"), ccAdmin.getMentors);
router.put("/campus-connect/mentors/:id", requirePermission("userManagement", "update"), ccAdmin.updateMentor);
router.get("/campus-connect/connections", requirePermission("userManagement", "view"), ccAdmin.getConnections);
router.post("/campus-connect/connections/force-disconnect", requirePermission("userManagement", "update"), ccAdmin.forceDisconnect);

// Skills
router.get("/campus-connect/skills", requirePermission("userManagement", "view"), ccAdmin.getSkills);
router.post("/campus-connect/skills", requirePermission("userManagement", "create"), ccAdmin.createSkill);
router.put("/campus-connect/skills/:id", requirePermission("userManagement", "update"), ccAdmin.updateSkill);
router.delete("/campus-connect/skills/:id", requirePermission("userManagement", "delete"), ccAdmin.deleteSkill);

// Interests
router.get("/campus-connect/interests", requirePermission("userManagement", "view"), ccAdmin.getInterests);
router.post("/campus-connect/interests", requirePermission("userManagement", "create"), ccAdmin.createInterest);
router.put("/campus-connect/interests/:id", requirePermission("userManagement", "update"), ccAdmin.updateInterest);
router.delete("/campus-connect/interests/:id", requirePermission("userManagement", "delete"), ccAdmin.deleteInterest);

// Goals
router.get("/campus-connect/goals", requirePermission("userManagement", "view"), ccAdmin.getGoals);
router.post("/campus-connect/goals", requirePermission("userManagement", "create"), ccAdmin.createGoal);
router.put("/campus-connect/goals/:id", requirePermission("userManagement", "update"), ccAdmin.updateGoal);
router.delete("/campus-connect/goals/:id", requirePermission("userManagement", "delete"), ccAdmin.deleteGoal);

// Communities (Dedicated Platform Ecosystem)
const communityUpload = upload.fields([
    { name: 'icon', maxCount: 1 },
    { name: 'coverPhoto', maxCount: 1 }
]);

router.get("/communities", requirePermission("userManagement", "view"), adminCommunityCtrl.getAdminCommunities);
router.post("/communities", requirePermission("userManagement", "create"), communityUpload, adminCommunityCtrl.createCommunity);
router.put("/communities/:id", requirePermission("userManagement", "update"), communityUpload, adminCommunityCtrl.updateCommunity);
router.delete("/communities/:id", requirePermission("userManagement", "delete"), adminCommunityCtrl.deleteCommunity);
router.get("/communities/:id/members", requirePermission("userManagement", "view"), adminCommunityCtrl.getAdminCommunityMembers);
router.put("/communities/:id/members/:userId/role", requirePermission("userManagement", "update"), adminCommunityCtrl.updateMemberRole);
router.delete("/communities/:id/members/:userId", requirePermission("userManagement", "delete"), adminCommunityCtrl.removeOrBanMember);

// Campus Connect Communities (Legacy Compatibility)
router.get("/campus-connect/communities", requirePermission("userManagement", "view"), adminCommunityCtrl.getAdminCommunities);
router.post("/campus-connect/communities", requirePermission("userManagement", "create"), communityUpload, adminCommunityCtrl.createCommunity);
router.put("/campus-connect/communities/:id", requirePermission("userManagement", "update"), communityUpload, adminCommunityCtrl.updateCommunity);
router.delete("/campus-connect/communities/:id", requirePermission("userManagement", "delete"), adminCommunityCtrl.deleteCommunity);

// Hierarchy Bulk CSV Upload & Export
router.post("/hierarchy/bulk-csv", requirePermission("userManagement", "create"), upload.single("csv"), collegeHierarchyAdmin.adminBulkUploadCSV);
router.post("/hierarchy/:category/bulk-csv", requirePermission("userManagement", "create"), upload.single("csv"), collegeHierarchyAdmin.adminBulkUploadCSV);
router.get("/hierarchy/export-csv", requirePermission("userManagement", "view"), collegeHierarchyAdmin.adminExportCSV);
router.get("/hierarchy/:category/export-csv", requirePermission("userManagement", "view"), collegeHierarchyAdmin.adminExportCSV);

// Hierarchy Universities CRUD
router.get("/hierarchy/universities", requirePermission("userManagement", "view"), collegeHierarchyAdmin.adminGetUniversities);
router.post("/hierarchy/universities", requirePermission("userManagement", "create"), collegeHierarchyAdmin.adminCreateUniversity);
router.put("/hierarchy/universities/:id", requirePermission("userManagement", "update"), collegeHierarchyAdmin.adminUpdateUniversity);
router.delete("/hierarchy/universities/:id", requirePermission("userManagement", "delete"), collegeHierarchyAdmin.adminDeleteUniversity);

// Hierarchy Campuses CRUD
router.get("/hierarchy/campuses", requirePermission("userManagement", "view"), collegeHierarchyAdmin.adminGetCampuses);
router.post("/hierarchy/campuses", requirePermission("userManagement", "create"), collegeHierarchyAdmin.adminCreateCampus);
router.put("/hierarchy/campuses/:id", requirePermission("userManagement", "update"), collegeHierarchyAdmin.adminUpdateCampus);
router.delete("/hierarchy/campuses/:id", requirePermission("userManagement", "delete"), collegeHierarchyAdmin.adminDeleteCampus);

// Hierarchy Departments CRUD
router.get("/hierarchy/departments", requirePermission("userManagement", "view"), collegeHierarchyAdmin.adminGetDepartments);
router.post("/hierarchy/departments", requirePermission("userManagement", "create"), collegeHierarchyAdmin.adminCreateDepartment);
router.put("/hierarchy/departments/:id", requirePermission("userManagement", "update"), collegeHierarchyAdmin.adminUpdateDepartment);
router.delete("/hierarchy/departments/:id", requirePermission("userManagement", "delete"), collegeHierarchyAdmin.adminDeleteDepartment);

// Hierarchy Branches CRUD
router.get("/hierarchy/branches", requirePermission("userManagement", "view"), collegeHierarchyAdmin.adminGetBranches);
router.post("/hierarchy/branches", requirePermission("userManagement", "create"), collegeHierarchyAdmin.adminCreateBranch);
router.put("/hierarchy/branches/:id", requirePermission("userManagement", "update"), collegeHierarchyAdmin.adminUpdateBranch);
router.delete("/hierarchy/branches/:id", requirePermission("userManagement", "delete"), collegeHierarchyAdmin.adminDeleteBranch);

// Team Finder Moderation CRUD
router.get("/teams", requirePermission("userManagement", "view"), adminTeamCtrl.getAdminTeams);
router.get("/teams/:id", requirePermission("userManagement", "view"), adminTeamCtrl.getAdminTeamDetails);
router.put("/teams/:id/status", requirePermission("userManagement", "update"), adminTeamCtrl.updateAdminTeamStatus);
router.delete("/teams/:id", requirePermission("userManagement", "delete"), adminTeamCtrl.deleteAdminTeam);

// Advertisements Management CRUD
router.get("/advertisements", adCtrl.getAdminAdvertisements);
router.post("/advertisements", upload.single("image"), adCtrl.createAdvertisement);
router.put("/advertisements/:id", upload.single("image"), adCtrl.updateAdvertisement);
router.patch("/advertisements/:id/status", adCtrl.toggleAdStatus);
router.delete("/advertisements/:id", adCtrl.deleteAdvertisement);

module.exports = router;
