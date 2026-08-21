const mongoose = require('mongoose');

const formatBytes = (bytes) => {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 MB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

/**
 * Retrieves real-time storage metrics for MongoDB database and Redis memory cache.
 */
async function getStorageMetrics() {
    // ── 1. MongoDB Storage Stats ─────────────────────────────────────────────
    let mongoStats = {
        status: 'Connected',
        usedBytes: 0,
        usedFormatted: '0 MB',
        storageBytes: 0,
        storageFormatted: '0 MB',
        freeBytes: 0,
        freeFormatted: '0 MB',
        totalCapacityBytes: 512 * 1024 * 1024, // 512 MB Free Tier baseline
        totalCapacityFormatted: '512 MB',
        usagePercent: 0,
        collections: 0,
        documents: 0,
        indexSizeBytes: 0,
        indexSizeFormatted: '0 MB'
    };

    try {
        if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
            const stats = await mongoose.connection.db.command({ dbStats: 1 });
            const dataSize = stats.dataSize || 0;
            const storageSize = stats.storageSize || 0;
            const indexSize = stats.indexSize || 0;
            const totalAllocated = storageSize + indexSize;

            // Plan baseline capacity (512MB default or dynamic scale)
            const capacity = Math.max(512 * 1024 * 1024, Math.ceil((totalAllocated * 1.5) / (512 * 1024 * 1024)) * 512 * 1024 * 1024);
            const free = Math.max(0, capacity - totalAllocated);
            const pct = Math.min(100, Math.round((totalAllocated / capacity) * 100));

            mongoStats = {
                status: 'Healthy',
                usedBytes: totalAllocated,
                usedFormatted: formatBytes(totalAllocated),
                dataSizeBytes: dataSize,
                dataSizeFormatted: formatBytes(dataSize),
                storageSizeBytes: storageSize,
                storageSizeFormatted: formatBytes(storageSize),
                indexSizeBytes: indexSize,
                indexSizeFormatted: formatBytes(indexSize),
                freeBytes: free,
                freeFormatted: formatBytes(free),
                totalCapacityBytes: capacity,
                totalCapacityFormatted: formatBytes(capacity),
                usagePercent: pct,
                collections: stats.collections || 0,
                documents: stats.objects || 0,
                avgObjSizeBytes: Math.round(stats.avgObjSize || 0)
            };
        }
    } catch (dbErr) {
        console.warn('⚠️ [StorageMetrics] MongoDB dbStats warning:', dbErr.message);
    }

    // ── 2. Redis Storage Stats ───────────────────────────────────────────────
    const { redisClient } = require('./redis');
    let redisStats = {
        status: redisClient ? 'Healthy' : 'Offline',
        usedBytes: 0,
        usedFormatted: '0 MB',
        peakBytes: 0,
        peakFormatted: '0 MB',
        freeBytes: 0,
        freeFormatted: '0 MB',
        totalCapacityBytes: 256 * 1024 * 1024,
        totalCapacityFormatted: '256 MB',
        usagePercent: 0,
        totalKeys: 0
    };

    try {
        if (redisClient && redisClient.status === 'ready') {
            const rawInfo = await redisClient.info('memory');
            const dbsize = await redisClient.dbsize().catch(() => 0);

            const lines = rawInfo.split('\r\n');
            const memoryDict = {};
            lines.forEach(line => {
                const [key, value] = line.split(':');
                if (key && value) memoryDict[key.trim()] = value.trim();
            });

            const usedMemory = parseInt(memoryDict.used_memory) || 0;
            const usedMemoryPeak = parseInt(memoryDict.used_memory_peak) || 0;
            const maxMemory = parseInt(memoryDict.maxmemory) || 0;
            const totalSystemMemory = parseInt(memoryDict.total_system_memory) || 0;

            const capacity = maxMemory > 0 ? maxMemory : (totalSystemMemory > 0 ? totalSystemMemory : 256 * 1024 * 1024);
            const free = Math.max(0, capacity - usedMemory);
            const pct = Math.min(100, Math.round((usedMemory / capacity) * 100));

            redisStats = {
                status: 'Healthy',
                usedBytes: usedMemory,
                usedFormatted: formatBytes(usedMemory),
                peakBytes: usedMemoryPeak,
                peakFormatted: formatBytes(usedMemoryPeak),
                freeBytes: free,
                freeFormatted: formatBytes(free),
                totalCapacityBytes: capacity,
                totalCapacityFormatted: formatBytes(capacity),
                usagePercent: pct,
                totalKeys: dbsize,
                fragmentationRatio: parseFloat(memoryDict.mem_fragmentation_ratio) || 1.0
            };
        }
    } catch (redisErr) {
        console.warn('⚠️ [StorageMetrics] Redis info warning:', redisErr.message);
    }

    return { mongo: mongoStats, redis: redisStats };
}

module.exports = { getStorageMetrics, formatBytes };
