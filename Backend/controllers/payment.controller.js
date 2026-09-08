const axios = require('axios');

// Kashier configuration — read from environment or fallback to hardcoded values
const KASHIER_SECRET_KEY = process.env.KASHIER_SECRET_KEY || '973b0dc2ccf0637a30678d466d500fca$7f67049c87c51118945136e99e4ed59bfd9e7d375831863a8c7dd8644bc38e79822c7c83637ce775a7f91992daa45a33';
const KASHIER_API_KEY = process.env.KASHIER_API_KEY || '8309ba82-761f-4235-8e0a-7079ff6fa6fd';
const KASHIER_MERCHANT_ID = process.env.KASHIER_MERCHANT_ID || 'MID-33946-809';
const KASHIER_API_URL = 'https://api.kashier.io/v3/payment/sessions';

/**
 * Extract sessionUrl from Kashier response, handling different response structures.
 * Kashier docs show sessionUrl at root level, but some API versions wrap it.
 */
function extractSessionUrl(responseData) {
    if (!responseData) return null;
    // Direct (official response structure per Kashier docs)
    if (responseData.sessionUrl) return responseData.sessionUrl;
    // Nested under 'body'
    if (responseData.body && responseData.body.sessionUrl) return responseData.body.sessionUrl;
    // Nested under 'response'
    if (responseData.response && responseData.response.sessionUrl) return responseData.response.sessionUrl;
    // Nested under 'data'
    if (responseData.data && responseData.data.sessionUrl) return responseData.data.sessionUrl;
    return null;
}

const createPaymentSession = async (req, res) => {
    try {
        const { amount, currency, orderId, customerEmail, merchantRedirect } = req.body;

        console.log('[Payment] Creating session for orderId:', orderId, 'amount:', amount, 'currency:', currency);

        // Validate required fields
        if (!orderId) {
            return res.status(400).json({ error: 'Missing orderId' });
        }
        if (!customerEmail) {
            return res.status(400).json({ error: 'Missing customerEmail' });
        }
        if (!currency) {
            return res.status(400).json({ error: 'Missing currency' });
        }

        // Validate amount
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ error: 'Invalid payment amount', amount });
        }

        // Find user and order by orderId
        const User = require('../models/User.model');
        const user = await User.findOne({ 'orders._id': orderId });
        if (!user) {
            console.error('[Payment] User not found for orderId:', orderId);
            return res.status(404).json({ error: 'User not found for this order' });
        }
        const order = user.orders.id(orderId);
        if (!order) {
            console.error('[Payment] Order not found in user for orderId:', orderId);
            return res.status(404).json({ error: 'Order not found' });
        }

        // Check if payment session URL already exists and is still valid
        if (order.paymentSessionUrl) {
            console.log('[Payment] Reusing existing session URL for order:', orderId);
            return res.status(200).json({ sessionUrl: order.paymentSessionUrl });
        }

        // Format amount properly — Kashier expects up to 2 decimal places as string
        const formattedAmount = numericAmount.toFixed(2);
        console.log('[Payment] Sending to Kashier — amount:', formattedAmount, 'orderId:', orderId);

        const requestBody = {
            expireAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
            maxFailureAttempts: 3,
            paymentType: 'credit',
            amount: formattedAmount,
            currency: currency,
            order: orderId,
            merchantRedirect: merchantRedirect || `https://knoozbook.com/order/callback`,
            display: 'ar',
            type: 'one-time',
            allowedMethods: 'card,wallet',
            merchantId: KASHIER_MERCHANT_ID,
            description: `Payment for order ${orderId}`,
            customer: {
                email: customerEmail,
                reference: orderId,
            },
            enable3DS: true,
        };

        console.log('[Payment] Kashier request body:', JSON.stringify(requestBody));

        // Create new payment session
        const response = await axios.post(
            KASHIER_API_URL,
            requestBody,
            {
                headers: {
                    Authorization: KASHIER_SECRET_KEY,
                    'api-key': KASHIER_API_KEY,
                    'Content-Type': 'application/json',
                },
                timeout: 30000, // 30 second timeout
            }
        );

        console.log('[Payment] Kashier response status:', response.status);
        console.log('[Payment] Kashier response data:', JSON.stringify(response.data));

        // Extract sessionUrl — handle different response structures
        const sessionUrl = extractSessionUrl(response.data);

        if (!sessionUrl) {
            console.error('[Payment] No sessionUrl found in Kashier response. Full response:', JSON.stringify(response.data));
            return res.status(500).json({
                error: 'No session URL returned from payment provider',
                kashierResponse: response.data,
            });
        }

        // Save payment session URL in order (atomic update to avoid Mongoose VersionError)
        try {
            await User.updateOne(
                { 'orders._id': orderId },
                { $set: { 'orders.$.paymentSessionUrl': sessionUrl } }
            );
        } catch (dbError) {
            console.error('[Payment] Failed to save sessionUrl to DB (atomic update):', dbError.message);
        }

        res.status(200).json({
            sessionUrl: sessionUrl,
        });
    } catch (error) {
        console.error('[Payment] Error creating payment session:', error.message);
        if (error.response) {
            console.error('[Payment] Kashier HTTP Status:', error.response.status);
            console.error('[Payment] Kashier Response Data:', JSON.stringify(error.response.data));
            console.error('[Payment] Kashier Response Headers:', JSON.stringify(error.response.headers));
            
            // If Kashier returns 400 and says session already exists, it often includes the sessionUrl!
            if (error.response.status === 400 && error.response.data && error.response.data.sessionUrl) {
                console.log('[Payment] Recovering existing session URL from Kashier 400 response');
                try {
                    await User.updateOne(
                        { 'orders._id': orderId },
                        { $set: { 'orders.$.paymentSessionUrl': error.response.data.sessionUrl } }
                    );
                } catch (dbErr) {
                    console.error('[Payment] Failed to update existing session URL in DB:', dbErr.message);
                }
                return res.status(200).json({ sessionUrl: error.response.data.sessionUrl });
            }

            return res.status(500).json({
                error: 'Kashier payment session failed',
                kashierStatus: error.response.status,
                kashierError: error.response.data,
                message: error.message
            });
        }
        if (error.code === 'ECONNABORTED') {
            console.error('[Payment] Kashier API timeout');
            return res.status(504).json({ error: 'Payment provider timeout. Please try again.', details: error.message });
        }
        console.error('[Payment] Network/unknown error:', error.message);
        console.error('[Payment] Full error:', error.stack);
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

        // Validate amount
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ error: 'Invalid payment amount', amount });
        }

        const formattedAmount = numericAmount.toFixed(2);

        const requestBody = {
            expireAt: new Date(Date.now() + 3600000).toISOString(),
            maxFailureAttempts: 3,
            paymentType: 'credit',
            amount: formattedAmount,
            currency: currency,
            order: subscriptionId, // Use subscriptionId as order reference
            merchantRedirect: merchantRedirect || `https://knoozbook.com/order/callback`,
            display: 'ar', // Arabic for better UX
            type: 'one-time',
            allowedMethods: 'card,wallet',
            merchantId: KASHIER_MERCHANT_ID,
            description: `Subscription Payment ${subscriptionId}`,
            customer: {
                email: customerEmail,
                reference: subscriptionId,
            },
            enable3DS: true,
        };

        console.log('[Payment] Subscription Kashier request body:', JSON.stringify(requestBody));

        // Create new payment session
        const response = await axios.post(
            KASHIER_API_URL,
            requestBody,
            {
                headers: {
                    Authorization: KASHIER_SECRET_KEY,
                    'api-key': KASHIER_API_KEY,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );

        // Extract sessionUrl — handle different response structures
        const sessionUrl = extractSessionUrl(response.data);

        if (!sessionUrl) {
            console.error('[Payment] No sessionUrl found in Kashier subscription response. Full response:', JSON.stringify(response.data));
            return res.status(500).json({
                error: 'No session URL returned from payment provider',
                kashierResponse: response.data,
            });
        }

        // Save payment session URL in subscription (atomic update)
        try {
            const Subscription = require('../models/Subscription.model');
            await Subscription.updateOne(
                { _id: subscriptionId },
                { $set: { paymentSessionUrl: sessionUrl } }
            );
        } catch (dbError) {
            console.error('[Payment] Failed to save sessionUrl to subscription in DB:', dbError.message);
        }

        res.status(200).json({
            sessionUrl: sessionUrl,
        });
    } catch (error) {
        console.error('Error creating subscription payment session:', error);
        if (error.response) {
            console.error('[Payment] Kashier HTTP Status:', error.response.status);
            console.error('[Payment] Kashier Response Data:', JSON.stringify(error.response.data));
            
            // If Kashier returns 400 and says session already exists, it often includes the sessionUrl!
            if (error.response.status === 400 && error.response.data && error.response.data.sessionUrl) {
                console.log('[Payment] Recovering existing session URL from Kashier 400 response');
                try {
                    const Subscription = require('../models/Subscription.model');
                    await Subscription.updateOne(
                        { _id: subscriptionId },
                        { $set: { paymentSessionUrl: error.response.data.sessionUrl } }
                    );
                } catch (dbErr) {
                    console.error('[Payment] Failed to update existing session URL in DB:', dbErr.message);
                }
                return res.status(200).json({ sessionUrl: error.response.data.sessionUrl });
            }

            return res.status(500).json({
                error: 'Kashier payment session failed',
                kashierStatus: error.response.status,
                kashierError: error.response.data,
                message: error.message
            });
        }
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
            return res.status(404).json({ success: false, message: 'Order not found (User not found)' });
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

        // Trigger book recommendation workflow
        try {
            const axios = require('axios');
            const firstBookId = order.products && order.products[0] 
                ? (order.products[0].book || order.products[0].bookId || order.products[0].products_id)
                : null;
            
            if (firstBookId) {
                await axios.post('https://n8n.knoozbook.com/webhook/book-recommendation', {
                    userId: user._id.toString(),
                    eventType: 'purchase',
                    bookId: firstBookId.toString()
                });
                console.log('[verifyOrderPayment] Book recommendation workflow triggered for user:', user._id);
            }
        } catch (webhookError) {
            console.error('[verifyOrderPayment] Failed to trigger book recommendation workflow:', webhookError.message);
            // Don't fail the payment verification if webhook fails
        }

        // Return order details including products for analytics
        res.json({ 
            success: true, 
            message: 'Payment verified and order updated',
            orderId: order._id,
            products: order.products ? order.products.map(p => ({
                id: p.book || p.bookId || p.products_id,
                price: p.price || p.product_price || 0,
                quantity: p.quantity || 1
            })) : [],
            totalAmount: order.totalAmount || order.total_price || 0
        });

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
