const express = require("express");
const router = express.Router();
const controller = require("../controllers/collegeHierarchy.controller");

// ── Unified Institution Search (College = source of truth) ──────────────────
// All institutions — colleges, universities, IITs, NITs — are in the College collection.
router.get("/colleges", controller.getCampuses);         // primary route
router.get("/campuses", controller.getCampuses);         // alias (legacy)
router.get("/universities", controller.getCampuses);     // alias — now returns College list

// Independent Academic Fields (no institution dependency)
router.get("/departments", controller.getDepartments);
router.get("/branches", controller.getBranches);

// Legacy cascading routes removed (no longer needed):
// /universities/:universityId/campuses  ← removed
// /campuses/:campusId/departments       ← removed
// /departments/:departmentId/branches   ← removed

module.exports = router;
