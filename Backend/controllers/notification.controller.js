const PushSubscription = require('../models/PushSubscription.model');
const pushService = require('../services/push-notification.service');
const contentLibrary = require('../data/notifications-content.json');

exports.getPublicKey = (req, res) => {
    try {
        const key = pushService.getPublicKey();
        res.status(200).json({ publicKey: key });
    } catch (err) {
        console.error('Error getting public key:', err);
        res.status(500).json({ message: 'Error retrieving public key' });
    }
};

exports.subscribe = async (req, res) => {
    try {
        const { subscription, token, platform, userAgent } = req.body;
        const userId = req.user ? req.user._id : null;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        let query = {};
        let updateData = { userId, userAgent: userAgent || req.headers['user-agent'] };

        // --- SCENARIO 1: NATIVE (Android/iOS) ---
        if (token && platform) {
            query = { token: token }; // Unique by FCM Token
            updateData.token = token;
            updateData.platform = platform; // 'android' or 'ios'
            updateData.endpoint = undefined; // Do not save 'null', avoid Unique key collision
            updateData.keys = undefined;
        }

        // --- SCENARIO 2: WEB PUSH ---
        else if (subscription && subscription.endpoint) {
            query = { endpoint: subscription.endpoint }; // Unique by Web Endpoint
            updateData.endpoint = subscription.endpoint;
            updateData.keys = subscription.keys;
            updateData.platform = 'web';
            updateData.token = undefined; // Do not save 'null'
        }

        else {
            return res.status(400).json({ message: 'Invalid subscription data. Must provide subscription (Web) or token (Native).' });
        }

        // Upsert subscription
        await PushSubscription.findOneAndUpdate(
            query,
            updateData,
            { upsert: true, new: true }
        );

        res.status(201).json({ success: true, message: 'Subscribed successfully' });

    } catch (error) {
        console.error('❌ Subscribe Error:', error);
        res.status(500).json({ message: 'Failed to subscribe', error: error.message });
    }
};

exports.unsubscribe = async (req, res) => {
    try {
        const { endpoint } = req.body;
        await PushSubscription.deleteOne({ endpoint });
        res.status(200).json({ message: 'Unsubscribed successfully' });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ message: 'Failed to unsubscribe' });
    }
};

exports.getLibrary = (req, res) => {
    // Flatten the library for easier frontend consumption or return as is
    // Let's return a unified list for the dropdown
    const library = [];
    if (contentLibrary.quotes) {
        contentLibrary.quotes.forEach((q, i) => library.push({ id: `quote_${i}`, title: 'حكمة: ' + q.author, body: q.text, type: 'quote' }));
    }
    if (contentLibrary.facts) {
        contentLibrary.facts.forEach((f, i) => library.push({ id: `fact_${i}`, title: 'هل تعلم؟', body: f.text, type: 'fact' }));
    }
    // Add generic templates if any
    res.status(200).json({ library });
};

exports.sendAdminNotification = async (req, res) => {
    try {
        // Flexible payload handling
        const { type, manualData, title, body, url, userId, icon } = req.body;

        let payload = {
            notification: {
                title: title || 'Knoozbook',
                body: body || '',
                icon: icon || '/assets/icons/icon-192x192.png',
                vibrate: [100, 50, 100],
                data: {
                    url: url || '/how-to-earn' // Default or provided
                }
            }
        };

        // If 'type' is provided (legacy/alternative mode), override content
        if (type === 'quote') { /* ... existing logic ... */ }
        // We will prioritize direct title/body if provided

        if (!payload.notification.title || !payload.notification.body) {
            return res.status(400).json({ message: 'Title and body are required' });
        }

        let result;
        const User = require('../models/User.model');

        // Check for targeting criteria in manualData or direct fields
        const target = req.body.target || {};

        if (userId) {
            // Priority 1: Specific User ID
            result = await pushService.sendToUser(userId, payload);
            res.status(200).json({ message: 'Sent to user', result });

        } else if (target.type === 'new_users') {
            // Priority 2: New Users (e.g., created in last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const users = await User.find({ createdAt: { $gte: sevenDaysAgo } }).select('_id');
            const userIds = users.map(u => u._id);

            console.log(`Targeting ${userIds.length} new users...`);
            // We need a bulk send method, but for now loop
            let sentCount = 0;
            for (const uid of userIds) {
                await pushService.sendToUser(uid, payload);
                sentCount++;
            }
            res.status(200).json({ message: 'Sent to new users', count: sentCount });

        } else if (target.governorate) {
            // Priority 3: Specific Governorate
            const users = await User.find({ governorate: target.governorate }).select('_id');
            const userIds = users.map(u => u._id);

            console.log(`Targeting ${userIds.length} users in ${target.governorate}...`);
            let sentCount = 0;
            for (const uid of userIds) {
                await pushService.sendToUser(uid, payload);
                sentCount++;
            }
            res.status(200).json({ message: `Sent to users in ${target.governorate}`, count: sentCount });

        } else {
            // Priority 4: Broadcast to ALL
            const stats = await pushService.broadcastNotification(payload);
            res.status(200).json({ message: 'Broadcast complete', successCount: stats.successCount });
        }

    } catch (error) {
        console.error('Send Notification Error:', error);
        res.status(500).json({ message: 'Failed to send notification' });
    }
};

/**
 * Public send notification endpoint for n8n workflows
 */
exports.sendNotification = async (req, res) => {
    try {
        const { userId, type, title, message, data, important } = req.body;

        if (!userId || !title || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'userId, title, and message are required' 
            });
        }

        const User = require('../models/User.model');

        // Save notification to database
        const user = await User.findById(userId);
        if (user) {
            user.notifications.push({
                message: message,
                type: type || 'recommendation',
                read: false,
                createdAt: new Date(),
                data: data || {}
            });
            await user.save({ validateBeforeSave: false });
            console.log(`[Notification] Saved to DB for user ${userId}: ${title}`);
        }

        const payload = {
            notification: {
                title: title,
                body: message,
                icon: '/assets/icons/icon-192x192.png',
                vibrate: [100, 50, 100],
                data: data || {}
            }
        };

        // Try to send notification, but don't fail if user has no subscriptions
        try {
            const result = await pushService.sendToUser(userId, payload, { important: important || false });
            console.log(`[Notification] Sent push to user ${userId}: ${title}`);
            
            res.json({ 
                success: true, 
                message: 'Notification sent',
                result
            });
        } catch (pushError) {
            // If push notification fails, still return success (user might not have subscriptions)
            console.warn(`[Notification] Push failed for user ${userId}:`, pushError.message);
            res.json({ 
                success: true, 
                message: 'Notification saved to DB (no active push subscriptions)',
                warning: 'No active push subscriptions for this user'
            });
        }
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


