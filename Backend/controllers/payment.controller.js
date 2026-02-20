const axios = require('axios');

const createPaymentSession = async (req, res) => {
    try {
        const { amount, currency, orderId, customerEmail, merchantRedirect } = req.body;

        // Find user and order by orderId
        const User = require('../models/User.model');
        const user = await User.findOne({ 'orders._id': orderId });
        if (!user) {
            return res.status(404).json({ error: 'User not found for this order' });
        }
        const order = user.orders.id(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Check if payment session URL already exists
        if (order.paymentSessionUrl) {
            return res.status(200).json({ sessionUrl: order.paymentSessionUrl });
        }

        // Create new payment session
        const response = await axios.post(
            'https://api.kashier.io/v3/payment/sessions',
            {
                expireAt: new Date(Date.now() + 3600000).toISOString(),
                maxFailureAttempts: 3,
                paymentType: 'credit',
                amount: amount.toString(),
                currency: currency,
                order: orderId,
                merchantRedirect: merchantRedirect,
                display: 'ar',
                type: 'one-time',
                allowedMethods: 'card,wallet',
                merchantId: 'MID-33946-809',
                description: `Payment for order ${orderId}`,
                customer: {
                    email: customerEmail,
                    reference: orderId,
                },
                enable3DS: true,
            },
            {
                headers: {
                    Authorization: '973b0dc2ccf0637a30678d466d500fca$7f67049c87c51118945136e99e4ed59bfd9e7d375831863a8c7dd8644bc38e79822c7c83637ce775a7f91992daa45a33',
                    'api-key': '8309ba82-761f-4235-8e0a-7079ff6fa6fd',
                    'Content-Type': 'application/json',
                },
            }
        );

        // Save payment session URL in order
        order.paymentSessionUrl = response.data.sessionUrl;
        await user.save();

        res.status(200).json({
            sessionUrl: response.data.sessionUrl,
        });
    } catch (error) {
        console.error('Error creating payment session:', error);
        if (error.response) {
            console.error('Kashier Response Error:', error.response.data);
            return res.status(500).json({
                error: 'Failed to create payment session (Kashier Error)',
                details: error.response.data,
                message: error.message
            });
        }
        res.status(500).json({ error: 'Failed to create payment session', details: error.message });
    }
};

const createSubscriptionPaymentSession = async (req, res) => {
    try {
        const { amount, currency, subscriptionId, customerEmail, merchantRedirect } = req.body;

        // Find subscription
        const Subscription = require('../models/Subscription.model');
        const subscription = await Subscription.findById(subscriptionId);
        if (!subscription) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        // Check if payment session URL already exists
        if (subscription.paymentSessionUrl && subscription.paymentStatus === 'pending') {
            return res.status(200).json({ sessionUrl: subscription.paymentSessionUrl });
        }

        // Create new payment session
        const response = await axios.post(
            'https://api.kashier.io/v3/payment/sessions',
            {
                expireAt: new Date(Date.now() + 3600000).toISOString(),
                maxFailureAttempts: 3,
                paymentType: 'credit',
                amount: amount.toString(),
                currency: currency,
                order: subscriptionId, // Use subscriptionId as order reference
                merchantRedirect: merchantRedirect,
                display: 'ar', // Arabic for better UX
                type: 'one-time',
                allowedMethods: 'card,wallet',
                merchantId: 'MID-33946-809',
                description: `Subscription Payment ${subscriptionId}`,
                customer: {
                    email: customerEmail,
                    reference: subscriptionId,
                },
                enable3DS: true,
            },
            {
                headers: {
                    Authorization: '973b0dc2ccf0637a30678d466d500fca$7f67049c87c51118945136e99e4ed59bfd9e7d375831863a8c7dd8644bc38e79822c7c83637ce775a7f91992daa45a33',
                    'api-key': '8309ba82-761f-4235-8e0a-7079ff6fa6fd',
                    'Content-Type': 'application/json',
                },
            }
        );

        // Save payment session URL in subscription
        subscription.paymentSessionUrl = response.data.sessionUrl;
        await subscription.save();

        res.status(200).json({
            sessionUrl: response.data.sessionUrl,
        });
    } catch (error) {
        console.error('Error creating subscription payment session:', error);
        res.status(500).json({ error: 'Failed to create payment session', details: error.message });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { paymentId, merchantId, orderId, signature, status, paymentStatus, merchantOrderId } = req.query;

        // Verify status (Kashier might send 'status' or 'paymentStatus')
        const finalStatus = status || paymentStatus;

        if (finalStatus !== 'SUCCESS') {
            return res.json({ success: false, message: `Payment failed or cancelled (Status: ${finalStatus})` });
        }

        // Here we should ideally verify the signature using the merchant secret
        // For now, we trust the status and orderId (SubscriptionId)

        const Subscription = require('../models/Subscription.model');
        const User = require('../models/User.model');

        // Kashier sends 'orderId' as their Transaction ID (UUID), and 'merchantOrderId' as OUR Order ID (Mongo ID)
        // We must use merchantOrderId to find the subscription.
        const targetId = merchantOrderId;

        if (!targetId) {
            return res.status(400).json({ success: false, message: 'Missing merchantOrderId' });
        }

        const subscription = await Subscription.findById(targetId);
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        if (subscription.paymentStatus === 'completed') {
            return res.json({ success: true, message: 'Already processed' });
        }

        // Update Subscription
        subscription.paymentStatus = 'completed';
        subscription.status = 'active';
        subscription.paymentMethod = 'card'; // Confirmed card payment
        await subscription.save();

        // Update User
        await User.findByIdAndUpdate(subscription.userId, {
            activeSubscription: true,
            subscriptionEndDate: subscription.endDate
        });

        res.json({ success: true, message: 'Payment verified and subscription activated' });

    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ success: false, message: 'Verification error', details: error.message });
    }
};

const verifyOrderPayment = async (req, res) => {
    try {
        const { paymentId, merchantId, orderId, signature, status, paymentStatus, merchantOrderId } = req.query;

        console.log('Order Payment Verification Query:', req.query);

        // Verify status
        const finalStatus = status || paymentStatus;

        if (finalStatus !== 'SUCCESS') {
            return res.json({ success: false, message: `Payment failed or cancelled (Status: ${finalStatus})` });
        }

        // Use merchantOrderId to find the Order (which is embedded in User)
        const targetId = merchantOrderId;
        if (!targetId) {
            return res.status(400).json({ success: false, message: 'Missing merchantOrderId' });
        }

        const User = require('../models/User.model');
        // Find user who has this order
        const user = await User.findOne({ 'orders._id': targetId });

        if (!user) {
            return res.status(404).json({ success: false, message: 'Order nout found (User not found)' });
        }

        // Get the subdocument
        const order = user.orders.id(targetId);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status === 'paid' || order.status === 'completed' || order.paymentStatus === 'completed') {
            return res.json({ success: true, message: 'Already processed' });
        }

        // Update Order
        order.status = 'قيد الـتجهيز'; // Or 'Processing'
        order.paymentStatus = 'completed';

        await user.save({ validateBeforeSave: false });

        res.json({ success: true, message: 'Payment verified and order updated' });

    } catch (error) {
        console.error('Error verifying order payment:', error);
        res.status(500).json({ success: false, message: 'Verification error', details: error.message });
    }
};

module.exports = {
    createPaymentSession,
    createSubscriptionPaymentSession,
    verifyPayment,
    verifyOrderPayment
};
