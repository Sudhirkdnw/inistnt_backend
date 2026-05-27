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
    resetPasswordController,
    verifyAdminOtpController,
    resendOtpController,
    refreshTokenController
} = require("../controllers/auth.controller");
const { authMiddleware, softAuthMiddleware } = require("../middlewares/authmiddleware");
const validate = require("../middlewares/validation.middleware");
const { sendOtpSchema, registerSchema, loginSchema } = require("../validations/auth.validation");

/**
 * @openapi
 * /api/auth/send-otp:
 *   post:
 *     summary: Send OTP to college email
 *     description: Validates and generates a 6-digit OTP, sending it to the user's educational email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: student@university.edu
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Validation failed or invalid college email format
 */
router.post("/send-otp", validate(sendOtpSchema), sendOtpController);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new student user
 *     description: Creates a user account with either college email OTP verification or physical ID card upload.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - collegeName
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 example: secret123
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               collegeName:
 *                 type: string
 *                 example: Greater Noida University
 *               collegeEmail:
 *                 type: string
 *                 format: email
 *                 example: john@university.edu
 *               verificationMethod:
 *                 type: string
 *                 enum: [EMAIL, ID_CARD]
 *                 example: EMAIL
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               idCardImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: User already exists
 */
router.post("/register", upload.single("idCardImage"), validate(registerSchema), registerController);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: User Login
 *     description: Auths user credentials and returns session tokens. Admins trigger 2FA OTP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 example: secret123
 *     responses:
 *       200:
 *         description: Login successful (or OTP required for admins)
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", validate(loginSchema), loginController);
router.post("/verify-admin-otp", verifyAdminOtpController);
router.post("/resend-otp", resendOtpController);
router.post("/refresh-token", refreshTokenController);
router.post("/logout", logoutController);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user details
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Unauthorized
 */
router.get("/me", authMiddleware, getMeController);

// Password Reset
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password/:token", resetPasswordController);

module.exports = router;