const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { 
    sendOtpController, 
    registerController, 
    loginController, 
    logoutController, 
    getMeController,
    forgotPasswordController,
    resetPasswordController
} = require("../controllers/auth.controller");
const { authMiddleware, softAuthMiddleware } = require("../middlewares/authmiddleware");

router.post("/send-otp", sendOtpController);
router.post("/register", upload.single("idCardImage"), registerController);
router.post("/login", loginController);
router.post("/logout", logoutController);
router.get("/me", authMiddleware, getMeController);

// Password Reset
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password/:token", resetPasswordController);

module.exports = router;