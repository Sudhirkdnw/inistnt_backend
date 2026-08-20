const express = require("express");
const router = express.Router();
const controller = require("../controllers/collegeHierarchy.controller");

router.get("/universities", controller.getUniversities);
router.get("/universities/:universityId/campuses", controller.getCampuses);
router.get("/campuses/:campusId/departments", controller.getDepartments);
router.get("/departments/:departmentId/branches", controller.getBranches);

module.exports = router;
