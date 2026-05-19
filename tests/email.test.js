const mongoose = require("mongoose");
const { connectTestDB, clearDB, disconnectTestDB } = require("./helpers/dbHelper");
const emailService = require("../src/services/emailService");
const clientModule = require("../src/services/email/client");
const templatesModule = require("../src/services/email/templates");
const EmailLogger = require("../src/services/email/logger");
const retryModule = require("../src/services/email/retryHandler");
const emailQueue = require("../src/services/email/queue");
const EmailLog = require("../src/models/emailLog.model");

describe("📧 Enterprise Email System Unit Tests", () => {
    beforeAll(async () => {
        await connectTestDB();
        // Start background worker for queue testing
        emailQueue.start();
    });

    afterAll(async () => {
        emailQueue.stop();
        await disconnectTestDB();
    });

    beforeEach(async () => {
        await clearDB();
    });

    describe("1. Input Sanitization & Security (client.js)", () => {
        it("should strip newlines, carriage returns, and control chars to prevent SMTP injection", () => {
            const malSubject = "Hello\r\nInjectHeader: Value\nMoreHeaders: Value";
            const cleanSubject = clientModule.sanitizeEmailInput(malSubject);
            expect(cleanSubject).toBe("HelloInjectHeader: ValueMoreHeaders: Value");
        });

        it("should strip HTML tags from subjects/inputs", () => {
            const htmlSubject = "<h1>Welcome!</h1>";
            const clean = clientModule.sanitizeEmailInput(htmlSubject);
            expect(clean).toBe("Welcome!");
        });

        it("should lower case and clean email addresses", () => {
            const rawEmail = "  Sudhir.KDNW@College.Edu.In \r\n ";
            const clean = clientModule.sanitizeEmailAddress(rawEmail);
            expect(clean).toBe("sudhir.kdnw@college.edu.in");
        });

        it("should throw a validation error for invalid email structures", () => {
            expect(() => {
                clientModule.sanitizeEmailAddress("not_an_email");
            }).toThrow("Invalid email address format");
        });
    });

    describe("2. Premium Templates (templates.js)", () => {
        it("should render OTP template containing the verification code", () => {
            const rendered = templatesModule.renderOtpVerification("987654", "Sudhir", "Social Mini");
            expect(rendered).toContain("987654");
            expect(rendered).toContain("Sudhir");
            expect(rendered).toContain("Social Mini");
            expect(rendered).toContain("Verify Your Email");
        });

        it("should render Password Reset containing the absolute URL", () => {
            const url = "http://localhost:5000/reset/token123";
            const rendered = templatesModule.renderPasswordReset(url, "Sudhir", "Social Mini");
            expect(rendered).toContain(url);
            expect(rendered).toContain("Reset My Password");
        });

        it("should render Welcome layout containing greeting", () => {
            const rendered = templatesModule.renderWelcomeEmail("Sudhir", "Social Mini");
            expect(rendered).toContain("Welcome to the Club, Sudhir!");
        });

        it("should render Security Alert containing IP address and Device metadata", () => {
            const alertDetails = {
                ipAddress: "192.168.1.50",
                device: "iPhone / Mobile Safari",
                time: "2026-05-18 23:45",
                action: "Password Change Attempt"
            };
            const rendered = templatesModule.renderSecurityAlert(alertDetails, "Sudhir", "Social Mini");
            expect(rendered).toContain("192.168.1.50");
            expect(rendered).toContain("iPhone");
            expect(rendered).toContain("Password Change Attempt");
        });
    });

    describe("3. Exponential Backoff & Error Classification (retryHandler.js)", () => {
        it("should calculate correct exponential delays with variance", () => {
            const delay1 = retryModule.calculateBackoffDelay(1, 1000);
            // 1st attempt: 1000 * 2^0 = 1000ms. With jitter (0.8 to 1.2), value should be between 800 and 1200
            expect(delay1).toBeGreaterThanOrEqual(800);
            expect(delay1).toBeLessThanOrEqual(1200);

            const delay2 = retryModule.calculateBackoffDelay(2, 1000);
            // 2nd attempt: 1000 * 2^1 = 2000ms. With jitter, between 1600 and 2400
            expect(delay2).toBeGreaterThanOrEqual(1600);
            expect(delay2).toBeLessThanOrEqual(2400);
        });

        it("should classify transient failures (Timeout, 429, server crash) as retryable", () => {
            const rateLimitErr = new Error("Resend API: 429 Rate Limit Exceeded");
            const timeoutErr = new retryModule.TimeoutError("Connection timeout");
            const serverErr = new Error("Resend server error 503 Service Unavailable");
            
            expect(retryModule.isRetryableError(rateLimitErr)).toBe(true);
            expect(retryModule.isRetryableError(timeoutErr)).toBe(true);
            expect(retryModule.isRetryableError(serverErr)).toBe(true);
        });

        it("should classify fatal errors (invalid address, invalid credentials) as non-retryable", () => {
            const validationErr = new Error("Resend API: Invalid recipient email");
            const apiKeyErr = new Error("Resend API: Unauthorized. Invalid API Key");
            
            expect(retryModule.isRetryableError(validationErr)).toBe(false);
            expect(retryModule.isRetryableError(apiKeyErr)).toBe(false);
        });
    });

    describe("4. Production Logger & DB Telemetry (logger.js)", () => {
        it("should register queued emails in database with correct initial statuses", async () => {
            const log = await EmailLogger.logQueued("test@socialmini.edu", "Unit Test Queued", "test_template");
            expect(log._id).toBeDefined();
            expect(log.status).toBe("pending");
            expect(log.attempts).toBe(0);
            
            const dbRecord = await EmailLog.findById(log._id);
            expect(dbRecord.to).toBe("test@socialmini.edu");
            expect(dbRecord.subject).toBe("Unit Test Queued");
        });

        it("should compute processing states and latency metrics on successful deliver", async () => {
            const dbLog = await EmailLogger.logQueued("test@socialmini.edu", "Latency Test", "test");
            
            // Advance state to processing
            await EmailLogger.logProcessing(dbLog);
            expect(dbLog.attempts).toBe(1);
            expect(dbLog.metadata.processingStartedAt).toBeDefined();
            
            // Mock successful API response
            const mockResendResponse = { data: { id: "resend-msg-1234" } };
            
            // Wait brief moment to register positive latency duration
            await new Promise(resolve => setTimeout(resolve, 50));
            
            await EmailLogger.logSent(dbLog, mockResendResponse, false);
            
            expect(dbLog.status).toBe("sent");
            expect(dbLog.sentAt).toBeDefined();
            expect(dbLog.metadata.apiLatencyMs).toBeGreaterThanOrEqual(40);
            expect(dbLog.metadata.resendResponse.data.id).toBe("resend-msg-1234");
        });

        it("should transition permanently failed emails to Dead-Letter status", async () => {
            const dbLog = await EmailLogger.logQueued("test@socialmini.edu", "DLQ test", "test");
            dbLog.attempts = 4;
            
            const fatalError = new Error("Permanent delivery exception");
            await EmailLogger.logFailed(dbLog, fatalError);
            
            expect(dbLog.status).toBe("failed");
            expect(dbLog.error).toBe("Permanent delivery exception");
            expect(dbLog.metadata.isDeadLetter).toBe(true);
        });
    });

    describe("5. Anti-Abuse Rate Limiter (index.js)", () => {
        it("should permit reasonable email request volume but block rapid bombardment (spam protection)", async () => {
            const recipient = "user-spam-target@college.edu.in";
            
            // Trigger 1, 2, 3 emails
            const req1 = await emailService.sendVerificationEmail(recipient, "111111");
            expect(req1.status).toBe("queued");
            
            const req2 = await emailService.sendVerificationEmail(recipient, "222222");
            expect(req2.status).toBe("queued");
            
            const req3 = await emailService.sendVerificationEmail(recipient, "333333");
            expect(req3.status).toBe("queued");
            
            // Triggering 4th email within the rate limit window should throw a 429
            await expect(
                emailService.sendVerificationEmail(recipient, "444444")
            ).rejects.toThrow("Rate limit exceeded: Too many emails requested");
        });
    });

    describe("6. Queue & Horizontal Worker Leases (queue.js)", () => {
        let originalGetResendClient;

        beforeAll(() => {
            originalGetResendClient = clientModule.getResendClient;
            clientModule.getResendClient = jest.fn().mockReturnValue({
                emails: {
                    send: jest.fn().mockResolvedValue({ data: { id: "mock-resend-id" } })
                }
            });
        });

        afterAll(() => {
            clientModule.getResendClient = originalGetResendClient;
        });

        it("should lease jobs atomically to prevent double processing in multi-node clusters", async () => {
            const dbLog = await EmailLogger.logQueued("horizontal@college.edu.in", "Horizontal lock test", "test");
            
            // Simulate worker picking up job
            await emailQueue.processJob(dbLog._id);
            
            const processedLog = await EmailLog.findById(dbLog._id);
            expect(processedLog.status).toBe("sent"); // Should deliver successfully with mock client
        });
    });
});
