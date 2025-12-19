const cron = require('node-cron');
const User = require('../models/User.model'); // Adjust path as needed
const pushNotificationService = require('./push-notification.service');

/**
 * Initialize all cron jobs
 */
exports.initCronJobs = () => {
    console.log('⏰ Initializing Cron Jobs...');

    // 1. Streak Saver: Run every day at 20:00 (8 PM)
    // Notify users who haven't logged in today (lastActive < today)
    cron.schedule('0 20 * * *', async () => {
        console.log('Running Streak Saver Job...');
        await checkStreaksAndNotify();
    });

    // 2. Daily Reward Reminder at 9 AM
    cron.schedule('0 9 * * *', () => {
        console.log('⏰ Running Daily Reward Reminder...');
        sendDailyRewardReminders();
    });

    // 3. Random Wisdom/Fact at 2 PM (Non-annoying)
    cron.schedule('0 14 * * *', async () => {
        console.log('⏰ Running Daily Wisdom...');
        try {
            const content = require('../data/notifications-content.json');
            const items = [...(content.quotes || []), ...(content.facts || [])];
            if (items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];

                const payload = {
                    notification: {
                        title: randomItem.author ? `حكمة اليوم من ${randomItem.author}` : 'هل تعلم؟',
                        body: randomItem.text,
                        icon: '/assets/icons/icon-192x192.png',
                        data: { url: '/home' } // Just open app
                    }
                };

                // Broadcast to all
                await pushNotificationService.broadcastNotification(payload, { important: false });
            }
        } catch (err) {
            console.error('Error sending daily wisdom:', err);
        }
    });

    console.log('✅ Cron Jobs Scheduled: Streaks (8 PM), Rewards (9 AM), Wisdom (2 PM)');
};

/**
 * Check for users at risk of losing their streak
 * Logic:
 * - Find users whose last login was yesterday (or earlier, depending on strictness).
 * - Exclude users who already logged in today.
 * - Send "Streak Saver" notification.
 */
async function checkStreaksAndNotify() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Find users who:
        // 1. Were last active yesterday (>= yesterday AND < today)
        // 2. Have not been active today (which is implicit if we check lastLoginRewardDate < today)
        // Adjust field name 'lastLoginRewardDate' based on where you track activity.
        // Assuming 'gamification.lastLoginRewardDate' tracks the last significant interaction.

        const usersToNotify = await User.find({
            'gamification.lastLoginRewardDate': { $gte: yesterday, $lt: today },
            'gamification.currentStreak': { $gt: 0 } // Only save streaks that exist
        }).limit(200); // Batch size

        console.log(`Found ${usersToNotify.length} users for Streak Saver.`);

        const payload = {
            notification: {
                title: '🔥 أنقذ التتابع الخاص بك!',
                body: 'لم تقم بزيارتنا اليوم! افتح التطبيق الآن للحفاظ على التتابع وكسب المكافآت.',
                icon: '/assets/icons/icon-192x192.png',
                data: { url: '/how-to-earn' }
            }
        };

        for (const user of usersToNotify) {
            await pushNotificationService.sendToUser(user._id, payload);
        }

    } catch (error) {
        console.error('Error in checkStreaksAndNotify:', error);
    }
}

/**
 * Send reminders for daily rewards
 */
async function sendDailyRewardReminders() {
    try {
        // Send a broadcast or targeted message
        const payload = {
            notification: {
                title: '🎁 مكافأتك اليومية بانتظارك!',
                body: 'سجل الدخول الآن واجمع عملاتك الذهبية المجانية.',
                icon: '/assets/icons/icon-192x192.png',
                data: { url: '/how-to-earn' }
            }
        };

        // For now, let's broadcast to everyone who has opted in
        // Ideally, filter out users who already claimed it today
        await pushNotificationService.broadcastNotification(payload);

    } catch (error) {
        console.error('Error in sendDailyRewardReminders:', error);
    }
}
