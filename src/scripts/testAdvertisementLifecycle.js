const path = require('path');
const dotenv = require('dotenv');
const sharp = require('sharp');
const mongoose = require('mongoose');

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const Advertisement = require('../models/advertisement.model');
const adCtrl = require('../controllers/advertisement.controller');

async function testAdvertisementLifecycle() {
    console.log("🚀 Starting Advertisement System Lifecycle Tests...\n");
    await mongoose.connect(process.env.MONGO_URI);

    try {
        // ── TEST 1: 4:3 Aspect Ratio Validation Helper ──────────
        console.log("▶ TEST 1: Aspect Ratio Validation");
        // Create 800x600 buffer (exact 4:3)
        const valid4x3Buffer = await sharp({
            create: {
                width: 800,
                height: 600,
                channels: 3,
                background: { r: 236, g: 72, b: 153 }
            }
        }).jpeg().toBuffer();

        // Create 800x400 buffer (2:1, not 4:3)
        const invalidBuffer = await sharp({
            create: {
                width: 800,
                height: 400,
                channels: 3,
                background: { r: 59, g: 130, b: 246 }
            }
        }).jpeg().toBuffer();

        // Test Mock Controller with Invalid Buffer
        let rejectCalled = false;
        let rejectMsg = "";
        const mockReqInvalid = {
            body: {
                name: "Invalid Ratio Ad",
                startAt: new Date(Date.now() - 10000).toISOString(),
                endAt: new Date(Date.now() + 1000000).toISOString(),
                status: "ACTIVE"
            },
            file: { buffer: invalidBuffer, mimetype: "image/jpeg" }
        };
        const mockResInvalid = {
            status: (code) => ({
                json: (data) => {
                    if (code === 400) {
                        rejectCalled = true;
                        rejectMsg = data.message;
                    }
                }
            })
        };

        await adCtrl.createAdvertisement(mockReqInvalid, mockResInvalid);
        console.log(`  • Non-4:3 image rejected with code 400: ${rejectCalled}`);
        console.log(`  • Rejection Message: "${rejectMsg}"`);
        if (!rejectCalled || rejectMsg !== "Advertisement image must have a 4:3 aspect ratio.") {
            throw new Error("TEST 1 Failed: Non-4:3 image was not rejected properly.");
        }
        console.log("  ✅ TEST 1 PASSED: Strict 4:3 aspect ratio validation works perfectly.\n");

        // ── TEST 2: Active Advertisement Filtering & Delivery ────
        console.log("▶ TEST 2: Active Ad Query & Expiration Logic");
        // Clean up test ads
        await Advertisement.deleteMany({ name: { $regex: /^TEST_AD_/ } });

        const now = new Date();
        const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const pastEnd = new Date(Date.now() - 60 * 1000);
        const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000);

        // 1. Valid Active Ad
        const activeAd = await Advertisement.create({
            name: "TEST_AD_ACTIVE",
            imageUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800",
            destinationUrl: "https://example.com/hackathon",
            startAt: past,
            endAt: future,
            status: "ACTIVE",
            priority: 1
        });

        // 2. Expired Ad
        const expiredAd = await Advertisement.create({
            name: "TEST_AD_EXPIRED",
            imageUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800",
            destinationUrl: "https://example.com/expired",
            startAt: past,
            endAt: pastEnd,
            status: "ACTIVE",
            priority: 2
        });

        // 3. Future Ad
        const futureAd = await Advertisement.create({
            name: "TEST_AD_FUTURE",
            imageUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800",
            destinationUrl: "https://example.com/future",
            startAt: futureStart,
            endAt: future,
            status: "ACTIVE",
            priority: 3
        });

        // 4. Paused Ad
        const pausedAd = await Advertisement.create({
            name: "TEST_AD_PAUSED",
            imageUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800",
            destinationUrl: "https://example.com/paused",
            startAt: past,
            endAt: future,
            status: "PAUSED",
            priority: 4
        });

        // Call getActiveAdvertisements endpoint handler
        let activeAdsResponse = null;
        const mockResActive = {
            status: (code) => ({
                json: (data) => {
                    activeAdsResponse = data;
                }
            })
        };

        await adCtrl.getActiveAdvertisements({}, mockResActive);

        console.log(`  • Active Ads Returned: ${activeAdsResponse.advertisements.length}`);
        const returnedIds = activeAdsResponse.advertisements.map(a => a._id.toString());
        console.log(`  • Returned Ad IDs:`, returnedIds);

        // Check active ad is present
        if (!returnedIds.includes(activeAd._id.toString())) {
            throw new Error("TEST 2 Failed: Active ad was not returned.");
        }
        // Check expired, future, paused are NOT present
        if (returnedIds.includes(expiredAd._id.toString())) {
            throw new Error("TEST 2 Failed: Expired ad was returned.");
        }
        if (returnedIds.includes(futureAd._id.toString())) {
            throw new Error("TEST 2 Failed: Future ad was returned.");
        }
        if (returnedIds.includes(pausedAd._id.toString())) {
            throw new Error("TEST 2 Failed: Paused ad was returned.");
        }

        // Verify expired ad status was transitioned to 'EXPIRED' in DB
        const reloadedExpired = await Advertisement.findById(expiredAd._id);
        console.log(`  • Expired Ad transitioned status in DB: "${reloadedExpired.status}"`);
        if (reloadedExpired.status !== 'EXPIRED') {
            throw new Error("TEST 2 Failed: Expired ad did not auto-transition to EXPIRED status.");
        }

        // Verify client-safe fields (internal name not exposed)
        const returnedAd = activeAdsResponse.advertisements.find(a => a._id.toString() === activeAd._id.toString());
        console.log(`  • Client-Safe Payload Fields:`, Object.keys(returnedAd));
        if (returnedAd.name || returnedAd.createdBy) {
            throw new Error("TEST 2 Failed: Sensitive internal fields (name/createdBy) exposed to client.");
        }
        console.log("  ✅ TEST 2 PASSED: Active ad filtering, auto-expiration, and security stripping verified.\n");

        // ── TEST 3: Click Tracking ──────────────────────────────
        console.log("▶ TEST 3: Click Event Tracking");
        const initialClicks = activeAd.clicksCount || 0;
        await adCtrl.recordClick({ params: { id: activeAd._id } }, {
            status: () => ({ json: () => {} })
        });
        const reloadedActive = await Advertisement.findById(activeAd._id);
        console.log(`  • Clicks before: ${initialClicks}, Clicks after: ${reloadedActive.clicksCount}`);
        if (reloadedActive.clicksCount !== initialClicks + 1) {
            throw new Error("TEST 3 Failed: Click count was not incremented.");
        }
        console.log("  ✅ TEST 3 PASSED: Click tracking verified.\n");

        // Clean up test ads
        await Advertisement.deleteMany({ name: { $regex: /^TEST_AD_/ } });
        console.log("🧹 Cleaned up test records.");

        console.log("🎉 ALL ADVERTISEMENT SYSTEM LIFECYCLE TESTS PASSED PERFECTLY!");
    } finally {
        await mongoose.disconnect();
    }
}

testAdvertisementLifecycle().catch(err => {
    console.error("❌ Test execution error:", err);
    process.exit(1);
});
