const PaymentGateway = require("./paymentGateway");
let stripeInstance = null;

const getStripe = async () => {
    const premiumSettingsModel = require("../../models/premiumSettings.model");
    const settings = await premiumSettingsModel.findOne();
    const stripeKey = (settings && settings.stripeSecretKey) || process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
        console.warn("⚠️ Stripe Secret Key is missing in database and environment.");
        return null;
    }
    return require("stripe")(stripeKey);
};

class StripeGateway extends PaymentGateway {
    async createSubscription(user, plan) {
        const stripe = await getStripe();
        if (!stripe) {
            throw new Error("Stripe Gateway is not configured.");
        }

        // 1. Create or retrieve Stripe Customer
        let customer;
        if (user.email) {
            const customers = await stripe.customers.list({ email: user.email, limit: 1 });
            if (customers.data.length > 0) {
                customer = customers.data[0];
            }
        }

        if (!customer) {
            customer = await stripe.customers.create({
                email: user.email || undefined,
                name: user.fullName || user.username,
                metadata: { userId: user._id.toString() }
            });
        }

        // 2. Map billing period to Stripe price configuration (weekly, monthly, yearly)
        let interval = "month";
        if (plan.billingPeriod === "yearly") interval = "year";
        if (plan.billingPeriod === "weekly") interval = "week";

        let stripePriceId = plan.stripePriceId;

        if (!stripePriceId) {
            // Create product and price dynamically on Stripe
            const product = await stripe.products.create({
                name: plan.name,
                description: plan.description || undefined,
                metadata: { planId: plan._id.toString() }
            });

            const price = await stripe.prices.create({
                product: product.id,
                unit_amount: Math.round(plan.price * 100), // Stripe price in cents
                currency: "inr",
                recurring: { interval }
            });

            plan.stripeProductId = product.id;
            plan.stripePriceId = price.id;
            await plan.save();
            stripePriceId = price.id;
        }

        // 3. Create Stripe Checkout Session
        const successUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/premium/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/premium/cancel`;

        const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            payment_method_types: ["card"],
            line_items: [{ price: stripePriceId, quantity: 1 }],
            mode: "subscription",
            success_url: successUrl,
            cancel_url: cancelUrl,
            subscription_data: {
                trial_period_days: plan.freeTrialDays || undefined,
                metadata: { userId: user._id.toString(), planId: plan._id.toString() }
            },
            metadata: { userId: user._id.toString(), planId: plan._id.toString() }
        });

        return {
            gateway: "stripe",
            subscriptionId: session.id,
            checkoutUrl: session.url,
            message: "Stripe checkout session created successfully"
        };
    }

    async cancelSubscription(gatewaySubscriptionId) {
        const stripe = await getStripe();
        if (!stripe) {
            throw new Error("Stripe Gateway is not configured.");
        }

        const canceled = await stripe.subscriptions.update(gatewaySubscriptionId, {
            cancel_at_period_end: true
        });

        return {
            success: true,
            status: "cancelled",
            gatewayResponse: canceled,
            message: "Stripe subscription successfully set to cancel at period end"
        };
    }

    async verifyPayment(verificationData) {
        const stripe = await getStripe();
        if (!stripe) {
            throw new Error("Stripe Gateway is not configured.");
        }

        const { sessionId } = verificationData;
        if (!sessionId) {
            throw new Error("Stripe checkout Session ID is required for verification");
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status === "paid") {
            return {
                success: true,
                transactionId: session.payment_intent || session.id,
                status: "completed",
                subscriptionId: session.subscription,
                rawResponse: session
            };
        } else {
            return {
                success: false,
                transactionId: session.id,
                status: "failed",
                rawResponse: session
            };
        }
    }

    async verifyWebhook(rawBody, signature) {
        const stripe = await getStripe();
        if (!stripe) {
            throw new Error("Stripe Gateway is not configured.");
        }
        const premiumSettingsModel = require("../../models/premiumSettings.model");
        const settings = await premiumSettingsModel.findOne();
        const webhookSecret = (settings && settings.stripeWebhookSecret) || process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            throw new Error("Stripe webhook secret is missing in database and environment.");
        }
        return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    }
}

module.exports = new StripeGateway();
