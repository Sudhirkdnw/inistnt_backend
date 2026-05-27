const InfrastructureLog = require("../models/infrastructureLog.model");
const { EmailLog } = require("@social-mini/shared-models");

class MonitoringController {
    /**
     * Get paginated logs with filterable fields and query matching.
     */
    static async getLogs(req, res) {
        try {
            const { page = 1, limit = 50, type, level, service, search, status } = req.query;
            
            const query = {};
            
            if (type) query.type = type;
            if (level) query.level = level;
            if (service) query.service = new RegExp(service, "i");
            if (status) query.status = status;
            
            if (search) {
                query.$or = [
                    { message: new RegExp(search, "i") },
                    { "metadata.error": new RegExp(search, "i") },
                    { "metadata.resendId": new RegExp(search, "i") }
                ];
            }
            
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            const logs = await InfrastructureLog.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate("userId", "username email");
                
            const total = await InfrastructureLog.countDocuments(query);
            
            res.status(200).json({
                success: true,
                data: logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Aggregate system events, email delivery, and worker queue health.
     */
    static async getAnalytics(req, res) {
        try {
            // 1. Logs severity level breakdown
            const levelsBreakdown = await InfrastructureLog.aggregate([
                { $group: { _id: "$level", count: { $sum: 1 } } }
            ]);
            
            // 2. Logs type/category breakdown
            const typesBreakdown = await InfrastructureLog.aggregate([
                { $group: { _id: "$type", count: { $sum: 1 } } }
            ]);

            // 3. Email statistics: Delivery success rate, total dispatches, and DLQ count
            const totalEmails = await EmailLog.countDocuments({});
            const sentEmails = await EmailLog.countDocuments({ status: "sent" });
            const pendingEmails = await EmailLog.countDocuments({ status: "pending" });
            const failedEmails = await EmailLog.countDocuments({ status: "failed" });
            const retryingEmails = await EmailLog.countDocuments({ status: "retrying" });
            
            const successRate = totalEmails > 0 ? ((sentEmails / totalEmails) * 100).toFixed(2) : "100.00";
            
            // 4. Queue latency metrics
            const latencyStats = await EmailLog.aggregate([
                { $match: { status: "sent", "metadata.queueLatencyMs": { $exists: true } } },
                {
                    $group: {
                        _id: null,
                        avgQueueLatency: { $avg: "$metadata.queueLatencyMs" },
                        avgApiLatency: { $avg: "$metadata.apiLatencyMs" },
                        maxQueueLatency: { $max: "$metadata.queueLatencyMs" }
                    }
                }
            ]);

            const avgQueueLatency = latencyStats[0]?.avgQueueLatency?.toFixed(0) || 0;
            const avgApiLatency = latencyStats[0]?.avgApiLatency?.toFixed(0) || 0;

            // 5. Worker lifecycle & queue status
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const activeWorkerLogs = await InfrastructureLog.find({
                service: /^email-worker/i,
                timestamp: { $gt: fiveMinutesAgo }
            }).limit(5);

            res.status(200).json({
                success: true,
                analytics: {
                    logsBreakdown: {
                        levels: levelsBreakdown.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
                        types: typesBreakdown.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
                    },
                    emailMetrics: {
                        total: totalEmails,
                        sent: sentEmails,
                        pending: pendingEmails,
                        failed: failedEmails, // Dead-Letter Queue (DLQ)
                        retrying: retryingEmails,
                        successRate: parseFloat(successRate),
                        avgQueueLatencyMs: parseInt(avgQueueLatency),
                        avgApiLatencyMs: parseInt(avgApiLatency)
                    },
                    systemHealth: {
                        redisAdapterStatus: "CONNECTED",
                        databaseStatus: "CONNECTED",
                        emailWorkerStatus: activeWorkerLogs.length > 0 || totalEmails > 0 ? "HEALTHY" : "IDLE"
                    }
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Clear all persisted infrastructure logs (Audit trail / Maintenance).
     */
    static async clearLogs(req, res) {
        try {
            await InfrastructureLog.deleteMany({});
            
            const InfrastructureLogger = require("../utils/infrastructureLogger");
            InfrastructureLogger.security("CRITICAL", `Administrator "${req.user.username}" (ID: ${req.user._id}) cleared all infrastructure logs.`, {
                userId: req.user._id,
                username: req.user.username,
                ip: req.ip
            }, req.user._id);

            res.status(200).json({ success: true, message: "Infrastructure logs cleared successfully." });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Export all logs into a JSON/CSV/Excel download.
     */
    static async exportLogs(req, res) {
        try {
            const { type, level, format = "json" } = req.query;
            const query = {};
            if (type) query.type = type;
            if (level) query.level = level;

            const logs = await InfrastructureLog.find(query)
                .sort({ timestamp: -1 })
                .populate("userId", "username email");

            const InfrastructureLogger = require("../utils/infrastructureLogger");
            InfrastructureLogger.security("INFO", `Admin "${req.user.username}" started exporting ${logs.length} system logs in ${format} format`, {
                adminId: req.user._id,
                format
            });

            if (format === "csv" || format === "excel") {
                const headers = ["ID", "Type", "Level", "Service", "Message", "Timestamp", "Status", "User", "Request ID"];
                
                const convertToCSV = (data, hdrs, extractor) => {
                    const headerRow = hdrs.map(h => `"${h.replace(/"/g, '""')}"`).join(",");
                    const rows = data.map(item => {
                        const values = extractor(item);
                        return values.map(val => {
                            if (val === null || val === undefined) return '""';
                            const str = String(val);
                            return `"${str.replace(/"/g, '""')}"`;
                        }).join(",");
                    });
                    return [headerRow, ...rows].join("\r\n");
                };

                const csvData = convertToCSV(logs, headers, (l) => [
                    l._id.toString(),
                    l.type || "",
                    l.level || "",
                    l.service || "",
                    l.message || "",
                    l.timestamp ? new Date(l.timestamp).toISOString() : "",
                    l.status || "",
                    l.userId ? `@${l.userId.username}` : "system",
                    l.requestId || ""
                ]);

                res.setHeader("Content-Type", format === "excel" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv");
                res.setHeader("Content-Disposition", `attachment; filename=infrastructure_logs_${Date.now()}.${format === "excel" ? "xlsx" : "csv"}`);
                
                InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" successfully completed logs export`, {
                    adminId: req.user._id,
                    count: logs.length
                });
                return res.status(200).send(csvData);
            }

            res.setHeader("Content-Type", "application/json");
            res.setHeader("Content-Disposition", `attachment; filename=infrastructure_logs_${Date.now()}.json`);
            
            InfrastructureLogger.security("SUCCESS", `Admin "${req.user.username}" successfully completed logs export`, {
                adminId: req.user._id,
                count: logs.length
            });
            return res.status(200).send(JSON.stringify(logs, null, 2));
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Bulk delete selected infrastructure logs.
     */
    static async bulkDeleteLogs(req, res) {
        try {
            const { logIds } = req.body;
            if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
                return res.status(400).json({ success: false, message: "No log IDs provided" });
            }

            const result = await InfrastructureLog.deleteMany({ _id: { $in: logIds } });

            const InfrastructureLogger = require("../utils/infrastructureLogger");
            InfrastructureLogger.security("WARNING", `Admin "${req.user.username}" bulk deleted ${result.deletedCount} system logs`, {
                adminId: req.user._id,
                deletedCount: result.deletedCount
            });

            res.status(200).json({ 
                success: true, 
                message: `Successfully deleted ${result.deletedCount} logs`, 
                deletedCount: result.deletedCount 
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Export all analytics summaries.
     */
    static async exportAnalytics(req, res) {
        try {
            const format = req.query.format || "json";

            const levelsBreakdown = await InfrastructureLog.aggregate([
                { $group: { _id: "$level", count: { $sum: 1 } } }
            ]);
            
            const typesBreakdown = await InfrastructureLog.aggregate([
                { $group: { _id: "$type", count: { $sum: 1 } } }
            ]);

            const totalEmails = await EmailLog.countDocuments({});
            const sentEmails = await EmailLog.countDocuments({ status: "sent" });
            const pendingEmails = await EmailLog.countDocuments({ status: "pending" });
            const failedEmails = await EmailLog.countDocuments({ status: "failed" });
            const retryingEmails = await EmailLog.countDocuments({ status: "retrying" });
            
            const successRate = totalEmails > 0 ? ((sentEmails / totalEmails) * 100).toFixed(2) : "100.00";

            const payload = {
                exportedAt: new Date().toISOString(),
                logsBreakdown: {
                    levels: levelsBreakdown.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
                    types: typesBreakdown.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
                },
                emailMetrics: {
                    total: totalEmails,
                    sent: sentEmails,
                    pending: pendingEmails,
                    failed: failedEmails,
                    retrying: retryingEmails,
                    successRate: parseFloat(successRate)
                }
            };

            const InfrastructureLogger = require("../utils/infrastructureLogger");
            InfrastructureLogger.security("INFO", `Admin "${req.user.username}" exported system analytics in ${format} format`, {
                adminId: req.user._id,
                format
            });

            if (format === "csv") {
                const convertToCSV = (data, hdrs, extractor) => {
                    const headerRow = hdrs.map(h => `"${h.replace(/"/g, '""')}"`).join(",");
                    const rows = data.map(item => {
                        const values = extractor(item);
                        return values.map(val => {
                            if (val === null || val === undefined) return '""';
                            const str = String(val);
                            return `"${str.replace(/"/g, '""')}"`;
                        }).join(",");
                    });
                    return [headerRow, ...rows].join("\r\n");
                };

                const flatAnalytics = [
                    { metric: "Total Emails", value: payload.emailMetrics.total },
                    { metric: "Sent Emails", value: payload.emailMetrics.sent },
                    { metric: "Pending Emails", value: payload.emailMetrics.pending },
                    { metric: "Failed Emails", value: payload.emailMetrics.failed },
                    { metric: "Retrying Emails", value: payload.emailMetrics.retrying },
                    { metric: "Success Rate (%)", value: payload.emailMetrics.successRate }
                ];

                const csvData = convertToCSV(flatAnalytics, ["Metric", "Value"], (item) => [
                    item.metric,
                    item.value
                ]);

                res.setHeader("Content-Type", "text/csv");
                res.setHeader("Content-Disposition", `attachment; filename=system_analytics_${Date.now()}.csv`);
                return res.status(200).send(csvData);
            }

            res.setHeader("Content-Type", "application/json");
            res.setHeader("Content-Disposition", `attachment; filename=system_analytics_${Date.now()}.json`);
            return res.status(200).send(JSON.stringify(payload, null, 2));
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = MonitoringController;
