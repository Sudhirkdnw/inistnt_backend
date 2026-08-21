const express = require("express");
const router = express.Router();
const controller = require("../controllers/collegeHierarchy.controller");

// Direct independent search / autocomplete endpoints (with ?q= support)
router.get("/universities", controller.getUniversities);
router.get("/campuses", controller.getCampuses);
router.get("/colleges", controller.getCampuses);
router.get("/departments", controller.getDepartments);
router.get("/branches", controller.getBranches);

// Backward-compatible cascading fallback routes
router.get("/universities/:universityId/campuses", controller.getCampuses);
router.get("/campuses/:campusId/departments", controller.getDepartments);
router.get("/departments/:departmentId/branches", controller.getBranches);

module.exports = router;
