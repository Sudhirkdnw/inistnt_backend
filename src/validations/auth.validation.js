const { z } = require("zod");

const sendOtpSchema = {
    body: z.object({
        email: z.string({
            required_error: "Email is required"
        }).email("Invalid email format").trim().toLowerCase()
    })
};

const registerSchema = {
    body: z.object({
        username: z.string({
            required_error: "Username is required"
        }).min(3, "Username must be at least 3 characters").trim().toLowerCase(),
        password: z.string({
            required_error: "Password is required"
        }).min(6, "Password must be at least 6 characters"),
        email: z.string().email("Invalid email format").trim().toLowerCase().optional(),
        fullName: z.string().trim().optional(),
        collegeName: z.string({
            required_error: "College/University name is required"
        }).trim(),
        collegeEmail: z.string().email("Invalid email format").trim().toLowerCase().optional(),
        verificationMethod: z.enum(["EMAIL", "ID_CARD"]).optional(),
        otp: z.string().trim().optional()
    })
};

const loginSchema = {
    body: z.object({
        username: z.string({
            required_error: "Username is required"
        }).trim().toLowerCase(),
        password: z.string({
            required_error: "Password is required"
        }),
        adminLogin: z.boolean().optional()
    })
};

module.exports = {
    sendOtpSchema,
    registerSchema,
    loginSchema
};
