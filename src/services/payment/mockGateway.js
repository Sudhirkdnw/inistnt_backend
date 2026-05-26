const PaymentGateway = require("./paymentGateway");

class MockGateway extends PaymentGateway {
    async createSubscription(user, plan) {
        // Generates a mock subscription ID and order info
        const mockSubId = `sub_mock_${Math.random().toString(36).substring(2, 11)}`;
        return {
            gateway: "mock",
            subscriptionId: mockSubId,
            checkoutUrl: "", // No redirect URL needed for mock
            planName: plan.name,
            price: plan.price,
            message: "Mock subscription order created successfully"
        };
    }

    async cancelSubscription(gatewaySubscriptionId) {
        return {
            success: true,
            status: "cancelled",
            message: `Mock subscription ${gatewaySubscriptionId} cancelled successfully`
        };
    }

    async verifyPayment(verificationData) {
        // Mock verification: simply checks if status is passed or always returns success
        const { success = true } = verificationData;
        const mockTxId = `tx_mock_${Math.random().toString(36).substring(2, 11)}`;
        
        if (success) {
            return {
                success: true,
                transactionId: mockTxId,
                status: "completed",
                rawResponse: { verificationData, verifiedAt: new Date() }
            };
        } else {
            return {
                success: false,
                transactionId: mockTxId,
                status: "failed",
                rawResponse: { error: "Verification simulated failure" }
            };
        }
    }
}

module.exports = new MockGateway();
