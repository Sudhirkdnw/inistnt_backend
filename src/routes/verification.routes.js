const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});
const authMiddleware = require("../middlewares/auth.middleware");
const verificationCtrl = require("../controllers/verification.controller");

// ── Secure 1-Click Email Actions (No Login Required, Cryptographically Signed) ──
router.get("/email-action/approve", verificationCtrl.emailActionApprove);
router.get("/email-action/reject-form", verificationCtrl.emailActionRejectForm);
router.post("/email-action/reject", express.urlencoded({ extended: true }), verificationCtrl.emailActionRejectSubmit);

// ── Mobile App Student ID Submission / Resubmission ──────────
router.post("/submit", authMiddleware, upload.single("idCardImage"), verificationCtrl.submitUserVerification);

module.exports = router;
