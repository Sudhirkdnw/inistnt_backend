const PaymentGateway = require("./paymentGateway");
const axios = require("axios");

const getCashfreeConfig = async () => {
    const premiumSettingsModel = require("../../models/premiumSettings.model");
    const settings = await premiumSettingsModel.findOne();
    const appId = (settings && settings.cashfreeAppId) || process.env.CASHFREE_APP_ID;
    const secretKey = (settings && settings.cashfreeSecretKey) || process.env.CASHFREE_SECRET_KEY;
    const isSandbox = settings ? settings.cashfreeSandboxMode : true;

    if (!appId || !secretKey) {
        console.warn("⚠️ Cashfree App ID or Secret Key is missing in database and environment.");
        return null;
    }

    return {
        appId,
        secretKey,
        baseUrl: isSandbox ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg"
    };
};

class CashfreeGateway extends PaymentGateway {
    async createSubscription(user, plan) {
        const config = await getCashfreeConfig();
        if (!config) {
            throw new Error("Cashfree Gateway is not configured.");
        }

        const orderId = `cf_sub_${user._id.toString()}_${Date.now()}`;

        try {
            const response = await axios.post(
                `${config.baseUrl}/orders`,
                {
                    order_id: orderId,
                    order_amount: Number(plan.price),
                    order_currency: "INR",
                    customer_details: {
                        customer_id: user._id.toString(),
                        customer_name: user.fullName || user.username || "Student",
                        customer_email: user.email || user.collegeEmail || "student@inistnt.in",
                        customer_phone: "9999999999" // Cashfree requires a customer phone, fallback to dummy
                    },
                    order_meta: {
                        return_url: `${(process.env.CLIENT_URL || "https://inistnt.in").replace(/^http:\/\//i, "https://")}/premium/success?order_id={order_id}`
                    }
                },
                {
                    headers: {
                        "x-client-id": config.appId,
                        "x-client-secret": config.secretKey,
                        "x-api-version": "2023-08-01",
                        "Content-Type": "application/json"
                    }
                }
            );

            const orderData = response.data;
            const isSandboxMode = config.baseUrl.includes("sandbox");
            
            // In Cashfree v3, the default orders API response doesn't contain a direct payment_link/checkoutUrl.
            // Instead, we construct the hosted checkout URL using the returned payment_session_id.
            const checkoutUrl = orderData.payment_link || 
                (isSandboxMode 
                    ? `https://payments-test.cashfree.com/order/#${orderData.payment_session_id}`
                    : `https://payments.cashfree.com/order/#${orderData.payment_session_id}`);

            return {
                gateway: "cashfree",
                subscriptionId: orderData.order_id,
                checkoutUrl: checkoutUrl,
                message: "Cashfree checkout session initialized successfully"
            };
        } catch (error) {
            console.error("Cashfree Order Creation Error:", error.response?.data || error.message);
            throw new Error(error.response?.data?.message || "Failed to initialize Cashfree checkout order");
        }
    }

    async cancelSubscription(gatewaySubscriptionId) {
        // Cashfree orders PG doesn't have a cancel subscription concept as we are doing simple billing plans
        return {
            success: true,
            status: "cancelled",
            message: "Cashfree payment subscription successfully cancelled locally"
        };
    }

    async verifyPayment(verificationData) {
        const config = await getCashfreeConfig();
        if (!config) {
            throw new Error("Cashfree Gateway is not configured.");
        }

        const { orderId } = verificationData;
        if (!orderId) {
            throw new Error("Cashfree Order ID is required for verification");
        }

        try {
            const response = await axios.get(
                `${config.baseUrl}/orders/${orderId}`,
                {
                    headers: {
                        "x-client-id": config.appId,
                        "x-client-secret": config.secretKey,
                        "x-api-version": "2023-08-01"
                    }
                }
            );

            const orderData = response.data;

            if (orderData.order_status === "PAID") {
                return {
                    success: true,
                    transactionId: orderData.order_id,
                    status: "completed",
                    subscriptionId: orderData.order_id,
                    rawResponse: orderData
                };
            } else {
                return {
                    success: false,
                    transactionId: orderData.order_id,
                    status: orderData.order_status || "failed",
                    rawResponse: orderData
                };
            }
        } catch (error) {
            console.error("Cashfree Order Verification Error:", error.response?.data || error.message);
            throw new Error(error.response?.data?.message || "Failed to verify Cashfree payment");
        }
    }
}

module.exports = new CashfreeGateway();
