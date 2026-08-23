const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB max
});

const { softAuthMiddleware, authMiddleware } = require("../middlewares/authmiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const adCtrl = require("../controllers/advertisement.controller");

// ── Mobile App / Public Client Endpoints ──────────────────────────
router.get("/active", softAuthMiddleware, adCtrl.getActiveAdvertisements);
router.post("/:id/click", softAuthMiddleware, adCtrl.recordClick);

// ── Admin Protected Endpoints ─────────────────────────────────────
router.get("/admin", authMiddleware, adminMiddleware, adCtrl.getAdminAdvertisements);
router.post("/admin", authMiddleware, adminMiddleware, upload.single("image"), adCtrl.createAdvertisement);
router.put("/admin/:id", authMiddleware, adminMiddleware, upload.single("image"), adCtrl.updateAdvertisement);
router.patch("/admin/:id/status", authMiddleware, adminMiddleware, adCtrl.toggleAdStatus);
router.delete("/admin/:id", authMiddleware, adminMiddleware, adCtrl.deleteAdvertisement);

module.exports = router;
