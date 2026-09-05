const express = require("express");
const router = express.Router();
const controller = require("../controllers/collegeHierarchy.controller");

// ── Unified Institution Search (College = source of truth) ──────────────────
// All institutions — colleges, universities, IITs, NITs — are in the College collection.
router.get("/colleges", controller.getCampuses);
router.get("/campuses", controller.getCampuses);
router.get("/universities", controller.getCampuses);
router.get("/universities/:universityId/campuses", controller.getCampuses);
router.get("/campuses/:campusId/departments", controller.getDepartments);

// Independent Academic Fields (no institution dependency)
router.get("/departments", controller.getDepartments);
router.get("/branches", controller.getBranches);

module.exports = router;

