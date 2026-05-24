const mongoose = require("mongoose");

const infrastructureLogSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            required: true,
            enum: ["EMAIL", "AUTH", "SOCKET", "REDIS", "SERVER", "SECURITY", "DATABASE", "RATE_LIMIT", "SYSTEM"],
            index: true
        },
        level: {
            type: String,
            required: true,
            enum: ["INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"],
            index: true
        },
        service: {
            type: String,
            required: true,
            index: true
        },
        message: {
            type: String,
            required: true
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed
        },
        timestamp: {
            type: Date,
            default: Date.now,
            index: true
        },
        status: {
            type: String,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            index: true
        },
        requestId: {
            type: String,
            index: true
        }
    },
    {
        capped: {
            size: 50 * 1024 * 1024, // 50 MB
            max: 20000 // 20,000 documents limit
        }
    }
);

// Compound index for fast time-range querying and filtering
infrastructureLogSchema.index({ type: 1, level: 1, timestamp: -1 });
infrastructureLogSchema.index({ service: 1, timestamp: -1 });

module.exports = mongoose.model("InfrastructureLog", infrastructureLogSchema);
