const express = require("express");
const router = express.Router();
const { createReport } = require("../controllers/report.controller");
const { authMiddleware } = require("../middlewares/authmiddleware");

// POST /api/reports/create
router.post("/create", authMiddleware, createReport);

module.exports = router;
