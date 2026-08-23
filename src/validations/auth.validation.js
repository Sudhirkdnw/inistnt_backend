const { z } = require("zod");

// Helper to convert empty strings or whitespace to undefined so .optional() works properly
const emptyToUndefined = (val) => (typeof val === "string" && val.trim() === "" ? undefined : val);

const sendOtpSchema = {
    body: z.object({
        email: z.string({
            required_error: "College email address is required"
        }).email("Please enter a valid email address (e.g. student@college.edu.in)").trim().toLowerCase()
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
        email: z.preprocess(
            emptyToUndefined,
            z.string().email("Please enter a valid email address").trim().toLowerCase().optional()
        ),
        fullName: z.preprocess(
            emptyToUndefined,
            z.string().trim().optional()
        ),
        collegeName: z.string({
            required_error: "Please select your College/University"
        }).trim(),
        collegeId: z.preprocess(emptyToUndefined, z.string().optional()),
        university: z.preprocess(emptyToUndefined, z.string().trim().optional()),
        universityId: z.preprocess(emptyToUndefined, z.string().trim().optional()),
        department: z.preprocess(emptyToUndefined, z.string().trim().optional()),
        branch: z.preprocess(emptyToUndefined, z.string().trim().optional()),
        semester: z.preprocess(emptyToUndefined, z.union([z.string(), z.number()]).optional()),
        collegeEmail: z.preprocess(
            emptyToUndefined,
            z.string().email("Please enter a valid college email address").trim().toLowerCase().optional()
        ),
        verificationMethod: z.enum(["EMAIL", "ID_CARD"]).optional(),
        otp: z.preprocess(emptyToUndefined, z.string().trim().optional())
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
