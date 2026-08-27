const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requirePermission = require("../middlewares/permission.middleware");
const {
    recordInstallation,
    getOverview,
    getUsersAnalytics,
    getActivityAnalytics,
    getAcquisitionFunnel,
    getFeatureAnalytics,
    getTechnicalHealth
} = require("../controllers/analytics.controller");

// Public anonymous app installation recording
router.post("/install", recordInstallation);

// Admin-only analytics endpoints
router.get("/overview", authMiddleware, adminMiddleware, requirePermission("analytics", "view"), getOverview);
router.get("/users", authMiddleware, adminMiddleware, requirePermission("analytics", "view"), getUsersAnalytics);
router.get("/activity", authMiddleware, adminMiddleware, requirePermission("analytics", "view"), getActivityAnalytics);
router.get("/acquisition", authMiddleware, adminMiddleware, requirePermission("analytics", "view"), getAcquisitionFunnel);
router.get("/features", authMiddleware, adminMiddleware, requirePermission("analytics", "view"), getFeatureAnalytics);
router.get("/technical-health", authMiddleware, adminMiddleware, requirePermission("analytics", "view"), getTechnicalHealth);

module.exports = router;
