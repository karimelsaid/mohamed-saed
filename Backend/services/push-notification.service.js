const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription.model');
const admin = require('./fcm.service');

// VAPID Keys provided by user
const publicVapidKey = 'BJKRXlgpJDMGLWn1aRx88o9k6Y5LmXbmy8-AQKue94gL4ckNxXgjXhzF3_w75OWUtkJbERroVbsN3PdmMF4MIbA';
const privateVapidKey = 'hKXRO4hf4qNerwkrAm3Y7tFiEQoN08r5j62PRHnrTnM';

webpush.setVapidDetails(
    'mailto:support@knoozbook.com',
    publicVapidKey,
    privateVapidKey
);

exports.getPublicKey = () => {
    return publicVapidKey;
};

/**
 * Sends a notification to a single subscription document (Hybrid: Web or Native)
 * @param sub Subscription object
 * @param payload Notification payload
 * @param options { important: boolean } - If true, high priority & long TTL
 */
exports.sendNotification = async (sub, payload, options = { important: false }) => {
    try {
        const isImportant = options.important;

        // Settings based on importance
        const ttl = isImportant ? 24 * 60 * 60 : 60 * 60; // 24h for important, 1h for others
        const urgency = isImportant ? 'high' : 'normal';
        const priority = isImportant ? 'high' : 'normal';
        // const collapseKey = isImportant ? undefined : 'updates'; // Optional: Use collapse key for non-critical

        // --- NATIVE ANDROID/iOS (FCM) ---
        if (sub.platform === 'android' || sub.platform === 'ios') {
            if (!sub.token) return false;

            const message = {
                token: sub.token,
                notification: {
                    title: payload.notification?.title || payload.title || 'KnoozBook',
                    body: payload.notification?.body || payload.body || 'New Notification',
                },
                data: {
                    url: payload.notification?.data?.url || payload.url || '/',
                    ...payload.data // Spread other data
                },
                android: {
                    ttl: ttl * 1000, // FCM expects milliseconds
                    priority: priority,
                    notification: {
                        clickAction: 'FLUTTER_NOTIFICATION_CLICK', // or your specific intent
                    }
                }
            };

            // Add collapse key for non-important to prevent flooding
            if (!isImportant) {
                message.android.collapseKey = 'updates';
            }

            await admin.messaging().send(message);
            // console.log(`✅ FCM Sent to ${sub.userId}`);
            return true;
        }

        // --- WEB PUSH ---
        else {
            if (!sub.endpoint) return false;

            // Construct Web Push config
            const pushConfig = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.keys.p256dh,
                    auth: sub.keys.auth
                }
            };

            const webOptions = {
                TTL: ttl,
                headers: {
                    'Urgency': urgency
                }
            };

            // Payload for Web Push is typically a JSON string
            await webpush.sendNotification(pushConfig, JSON.stringify(payload), webOptions);
            // console.log(`✅ Push delivered successfully to ${sub.platform} (${sub._id})`);
            return true;
        }

    } catch (error) {
        console.error(`❌ Error sending push to ${sub.platform} for user ${sub.userId}:`, error.message);

        // Handle Expired Subscriptions
        if (error.statusCode === 410 || error.statusCode === 404 || (error.code && error.code.includes('registration-token-not-registered'))) {
            console.log(`🗑️ Subscription expired/invalid, deleting from DB: ${sub._id}`);
            await PushSubscription.deleteOne({ _id: sub._id });
        }
        return false;
    }
};

exports.sendToUser = async (userId, payload, options = { important: false }) => {
    const subscriptions = await PushSubscription.find({ userId });

    if (subscriptions.length === 0) {
        return [];
    }

    console.log(`📡 Sending to ${subscriptions.length} devices for user: ${userId}`);

    // Send to all devices of the user
    const results = await Promise.all(subscriptions.map(async (sub) => {
        const success = await exports.sendNotification(sub, payload, options);
        if (success) console.log(`✅ Push sent to ${sub.platform} for ${userId}`);
        return success;
    }));

    return results;
};

exports.broadcastNotification = async (payload, options = { important: false }) => {
    // In production, use cursor or batches to avoid memory issues with millions of user
    const start = Date.now();
    const subscriptions = await PushSubscription.find({});
    console.log(`Broadcasting to ${subscriptions.length} subscribers...`);

    let successCount = 0;
    let failureCount = 0;

    const promises = subscriptions.map(async (sub) => {
        const success = await exports.sendNotification(sub, payload, options);
        if (success) successCount++; else failureCount++;
    });

    await Promise.all(promises);
    console.log(`Broadcast complete. Success: ${successCount}, Failed: ${failureCount}, Time: ${Date.now() - start}ms`);
    return { successCount, failureCount };
};
