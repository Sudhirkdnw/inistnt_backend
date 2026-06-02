const userModel = require("../models/user.model");
const subscriptionPlanModel = require("../models/subscriptionPlan.model");
const subscriptionModel = require("../models/subscription.model");
const paymentHistoryModel = require("../models/paymentHistory.model");
const { getPremiumSettingsCached } = require("../utils/premiumSettingsCache");
const gatewayFactory = require("../services/payment/gatewayFactory");

// GET /api/subscriptions/plans — Get all active premium plans
async function getActivePlans(req, res) {
    try {
        const plans = await subscriptionPlanModel.find({ isActive: true });
        res.status(200).json({ plans });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/subscriptions/purchase — Initiate purchase OR verify payment details
async function purchaseSubscription(req, res) {
    try {
        const { planId, gateway: reqGateway, paymentDetails } = req.body;
        const userId = req.user._id;

        if (!planId) {
            return res.status(400).json({ message: "Plan ID is required" });
        }

        const plan = await subscriptionPlanModel.findById(planId);
        if (!plan || !plan.isActive) {
            return res.status(404).json({ message: "Active subscription plan not found" });
        }

        // 1. Prevent duplicate active subscriptions
        const existingSub = await subscriptionModel.findOne({ 
            user: userId, 
            status: "active",
            endDate: { $gt: new Date() }
        });
        if (existingSub) {
            return res.status(400).json({ 
                message: "You already have an active subscription.", 
                subscription: existingSub 
            });
        }

        let gatewayName = reqGateway;
        if (!gatewayName) {
            const settings = await getPremiumSettingsCached();
            gatewayName = settings ? settings.activeGateway : (process.env.PAYMENT_GATEWAY || "mock");
        }
        const gateway = gatewayFactory.getGateway(gatewayName);

        // CASE A: Initializing subscription checkout (no payment verification details provided yet)
        if (!paymentDetails) {
            const checkoutData = await gateway.createSubscription(req.user, plan);
            
            if (gatewayName === "razorpay") {
                const authHeader = req.headers.authorization;
                const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : req.cookies.token;
                checkoutData.checkoutUrl = `${req.protocol}://${req.get('host')}/api/subscriptions/razorpay-checkout/${checkoutData.subscriptionId}?token=${token}`;
            }

            return res.status(200).json({
                message: "Checkout session initialized",
                ...checkoutData
            });
        }

        // CASE B: Verifying payment checkout response (signature/receipt/transaction verification)
        const verification = await gateway.verifyPayment(paymentDetails);
        if (!verification.success) {
            return res.status(400).json({ message: "Payment verification failed" });
        }

        // 2. Prevent payment spoofing / duplicate transaction claims
        const duplicateTx = await paymentHistoryModel.findOne({ 
            gatewayTransactionId: verification.transactionId,
            status: "completed"
        });
        if (duplicateTx) {
            return res.status(409).json({ message: "This transaction has already been processed." });
        }

        // 3. Compute subscription dates
        const startDate = new Date();
        const endDate = new Date();
        
        let daysToAdd = plan.freeTrialDays || 0;
        if (plan.billingPeriod === "weekly") daysToAdd += 7;
        else if (plan.billingPeriod === "monthly") daysToAdd += 30;
        else if (plan.billingPeriod === "yearly") daysToAdd += 365;
        else daysToAdd += 30; // default backup

        endDate.setDate(endDate.getDate() + daysToAdd);

        // 4. Save User Subscription record
        const subscription = await subscriptionModel.create({
            user: userId,
            plan: planId,
            status: "active",
            startDate,
            endDate,
            paymentGateway: gatewayName,
            gatewaySubscriptionId: verification.subscriptionId || ""
        });

        // 5. Update User Document premium values
        const updatedUser = await userModel.findByIdAndUpdate(userId, {
            isPremium: true,
            premiumExpireAt: endDate
        }, { new: true });

        // 6. Record payment history audit log
        await paymentHistoryModel.create({
            user: userId,
            subscription: subscription._id,
            plan: planId,
            amount: plan.price,
            status: "completed",
            paymentGateway: gatewayName,
            gatewayTransactionId: verification.transactionId,
            gatewayResponse: verification.rawResponse
        });

        // Send billing confirmation email
        try {
            const targetEmail = updatedUser.collegeEmail || updatedUser.email;
            if (targetEmail) {
                const emailService = require("../services/email");
                await emailService.sendBillingEmail(targetEmail, updatedUser.fullName || updatedUser.username, {
                    planName: plan.name,
                    amount: plan.price,
                    gateway: gatewayName,
                    transactionId: verification.transactionId,
                    date: startDate.toLocaleDateString(),
                    expiryDate: endDate.toLocaleDateString()
                });
                console.log(`✉️ [Purchase API] Billing confirmation email sent to ${targetEmail}`);
            }
        } catch (emailErr) {
            console.error("❌ [Purchase API] Failed to send billing email:", emailErr.message);
        }

        res.status(200).json({
            message: "Subscription purchased successfully!",
            subscription,
            isPremium: true,
            premiumExpireAt: endDate
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// POST /api/subscriptions/cancel — Cancel active subscription auto-renew
async function cancelSubscription(req, res) {
    try {
        const userId = req.user._id;

        // Find active subscription
        const subscription = await subscriptionModel.findOne({ 
            user: userId, 
            status: "active",
            endDate: { $gt: new Date() }
        });

        if (!subscription) {
            return res.status(404).json({ message: "No active subscription found to cancel" });
        }

        if (subscription.gatewaySubscriptionId && subscription.paymentGateway !== "mock") {
            try {
                const gateway = gatewayFactory.getGateway(subscription.paymentGateway);
                await gateway.cancelSubscription(subscription.gatewaySubscriptionId);
            } catch (gatewayErr) {
                console.error("Gateway cancellation error:", gatewayErr.message);
            }
        }

        // Set status to cancelled (which keeps premium access active until endDate, but disables auto-renew)
        subscription.status = "cancelled";
        subscription.cancelAtPeriodEnd = true;
        await subscription.save();

        res.status(200).json({
            message: "Subscription cancelled successfully. You will remain premium until the end of your billing cycle.",
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// GET /api/subscriptions/status — Fetch current user's subscription details and global toggles
async function getSubscriptionStatus(req, res) {
    try {
        const userId = req.user ? req.user._id : null;

        // 1. Get global settings
        let settings = await getPremiumSettingsCached();
        const isPremiumRequired = settings ? settings.isPremiumRequired : true;
        const showMockGateway = settings ? settings.showMockGateway : true;
        const activeGateway = settings ? settings.activeGateway : "mock";

        if (!userId) {
            return res.status(200).json({
                isPremiumRequired,
                showMockGateway: !!showMockGateway,
                activeGateway,
                isPremium: false,
                premiumExpireAt: null,
                subscription: null
            });
        }

        // 2. Fetch user details and active subscription
        const user = await userModel.findById(userId).select("isPremium premiumExpireAt");
        
        const now = new Date();
        const isPremium = user.isPremium && user.premiumExpireAt && new Date(user.premiumExpireAt) > now;

        const subscription = await subscriptionModel.findOne({ 
            user: userId, 
            status: { $in: ["active", "cancelled"] },
            endDate: { $gt: now }
        }).populate("plan", "name price billingPeriod");

        res.status(200).json({
            isPremiumRequired,
            showMockGateway: !!showMockGateway,
            activeGateway,
            isPremium: !!isPremium,
            premiumExpireAt: user.premiumExpireAt,
            subscription
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// GET /api/subscriptions/razorpay-checkout/:subscriptionId — Render secure web checkout page for Razorpay
async function renderRazorpayCheckout(req, res) {
    try {
        const { subscriptionId } = req.params;
        const token = req.query.token || "";
        if (!subscriptionId) {
            return res.status(400).send("Subscription ID is required");
        }

        const settings = await getPremiumSettingsCached();
        const keyId = (settings && settings.razorpayKeyId) || process.env.RAZORPAY_KEY_ID;
        const keySecret = (settings && settings.razorpayKeySecret) || process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
            return res.status(500).send("Razorpay Gateway is not configured.");
        }

        const Razorpay = require("razorpay");
        const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

        // Fetch subscription details from Razorpay to read metadata/notes
        let rzpSub;
        try {
            rzpSub = await rzp.subscriptions.fetch(subscriptionId);
        } catch (fetchErr) {
            return res.status(404).send(`Failed to fetch subscription: ${fetchErr.message}`);
        }

        const userId = rzpSub.notes?.userId;
        const planId = rzpSub.notes?.planId;

        if (!userId || !planId) {
            return res.status(400).send("Invalid subscription metadata (missing user or plan ID).");
        }

        const user = await userModel.findById(userId);
        const plan = await subscriptionPlanModel.findById(planId);

        if (!user || !plan) {
            return res.status(404).send("User or Subscription Plan not found.");
        }

        res.setHeader("Content-Type", "text/html");
        res.status(200).send(`
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inistnt Premium Checkout</title>
    <style>
        body {
            background-color: #121212;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
            text-align: center;
        }
        .container {
            max-width: 400px;
            width: 100%;
            background-color: #1c1c1e;
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            border: 1px solid #2c2c2e;
        }
        .loader {
            border: 4px solid #3a3a3c;
            border-top: 4px solid #FFD700;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .btn {
            background-color: #FFD700;
            color: #000000;
            padding: 12px 24px;
            border: none;
            border-radius: 25px;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
            transition: opacity 0.2s;
        }
        .btn:active {
            opacity: 0.8;
        }
        h2 {
            margin-top: 10px;
            font-size: 22px;
            color: #FFD700;
        }
        p {
            color: #aeaeae;
            font-size: 14px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="loader" id="loader"></div>
        <h2 id="status">Redirecting to Razorpay...</h2>
        <p id="sub-status">Please wait while we initialize the secure payment screen. Do not refresh or close this page.</p>
        <a href="inistnt://premium" class="btn" id="app-btn" style="display:none;">Back to App</a>
    </div>

    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
        const options = {
            "key": "${keyId}",
            "subscription_id": "${subscriptionId}",
            "name": "Inistnt Premium",
            "description": "${plan.name} Membership",
            "image": "https://raw.githubusercontent.com/Sudhirkdnw/social_mini/main/Inistnt/assets/icon.png",
            "handler": function (response) {
                document.getElementById("loader").style.display = "block";
                document.getElementById("status").innerText = "Verifying Payment...";
                document.getElementById("sub-status").innerText = "We are confirming your transaction with Razorpay. This will only take a moment.";
                
                // Send verification payload back to server
                fetch("/api/subscriptions/purchase", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer ${token}"
                    },
                    body: JSON.stringify({
                        planId: "${planId}",
                        gateway: "razorpay",
                        paymentDetails: {
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySubscriptionId: response.razorpay_subscription_id,
                            razorpaySignature: response.razorpay_signature
                        }
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.subscription) {
                        document.getElementById("loader").style.display = "none";
                        document.getElementById("status").innerText = "Payment Verified! 🎉";
                        document.getElementById("sub-status").innerText = "Your premium membership is active. You will be redirected back to the Inistnt app shortly.";
                        
                        setTimeout(() => {
                            window.location.href = "inistnt://premium/success";
                        }, 2000);
                        
                        document.getElementById("app-btn").href = "inistnt://premium/success";
                        document.getElementById("app-btn").innerText = "Open App";
                        document.getElementById("app-btn").style.display = "inline-block";
                    } else {
                        throw new Error(data.message || "Payment verification failed");
                    }
                })
                .catch(err => {
                    document.getElementById("loader").style.display = "none";
                    document.getElementById("status").innerText = "Verification Failed ❌";
                    document.getElementById("sub-status").innerText = err.message || "An error occurred while confirming your payment. Please contact support.";
                    
                    document.getElementById("app-btn").href = "inistnt://premium";
                    document.getElementById("app-btn").innerText = "Back to App";
                    document.getElementById("app-btn").style.display = "inline-block";
                });
            },
            "prefill": {
                "name": "${user.fullName || user.username}",
                "email": "${user.email || user.collegeEmail || ''}",
                "contact": ""
            },
            "theme": {
                "color": "#FFD700"
            },
            "modal": {
                "ondismiss": function() {
                    document.getElementById("loader").style.display = "none";
                    document.getElementById("status").innerText = "Payment Cancelled";
                    document.getElementById("sub-status").innerText = "You cancelled the payment. You can try again from the app.";
                    
                    setTimeout(() => {
                        window.location.href = "inistnt://premium/cancel";
                    }, 1500);

                    document.getElementById("app-btn").href = "inistnt://premium/cancel";
                    document.getElementById("app-btn").innerText = "Back to App";
                    document.getElementById("app-btn").style.display = "inline-block";
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.open();
    </script>
</body>
</html>
        `);
    } catch (err) {
        console.error("❌ [Razorpay Checkout Page] Fatal error:", err.message);
        res.status(500).send(`An error occurred: ${err.message}`);
    }
}

module.exports = {
    getActivePlans,
    purchaseSubscription,
    cancelSubscription,
    getSubscriptionStatus,
    renderRazorpayCheckout
};
