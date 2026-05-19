const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const MonitoringController = require("../controllers/monitoring.controller");

router.get("/logs", authMiddleware, adminMiddleware, MonitoringController.getLogs);
router.post("/logs/bulk-delete", authMiddleware, adminMiddleware, MonitoringController.bulkDeleteLogs);
router.get("/analytics", authMiddleware, adminMiddleware, MonitoringController.getAnalytics);
router.get("/analytics/export", authMiddleware, adminMiddleware, MonitoringController.exportAnalytics);
router.get("/export", authMiddleware, adminMiddleware, MonitoringController.exportLogs);
router.delete("/logs", authMiddleware, adminMiddleware, MonitoringController.clearLogs);

module.exports = router;
