class PaymentGateway {
    /**
     * Create a subscription checkout session / order
     * @param {Object} user 
     * @param {Object} plan 
     * @returns {Promise<Object>} Session or order object
     */
    async createSubscription(user, plan) {
        throw new Error("createSubscription method not implemented");
    }

    /**
     * Cancel an active subscription
     * @param {string} gatewaySubscriptionId 
     * @returns {Promise<Object>} Cancellation response
     */
    async cancelSubscription(gatewaySubscriptionId) {
        throw new Error("cancelSubscription method not implemented");
    }

    /**
     * Verify a transaction payment / subscription creation webhook or response
     * @param {Object} verificationData 
     * @returns {Promise<Object>} { success: boolean, transactionId: string, status: string, rawResponse: any }
     */
    async verifyPayment(verificationData) {
        throw new Error("verifyPayment method not implemented");
    }
}

module.exports = PaymentGateway;
