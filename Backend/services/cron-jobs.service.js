const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const User = require('../models/User.model'); // Adjust path as needed
const pushNotificationService = require('./push-notification.service');

/**
 * Initialize all cron jobs
 */
let scheduledTasks = []; // Store active cron tasks to stop them later

/**
 * Initialize all cron jobs
 */
exports.initCronJobs = async () => {

    // Stop existing tasks
    scheduledTasks.forEach(task => task.stop());
    scheduledTasks = [];

    // Fetch dynamic schedules
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.getInstance();
    const schedules = settings.notificationSchedules || {
        streakSaver: { hour: 20, minute: 0 },
        dailyReward: { hour: 9, minute: 0 },
        dailyWisdom: { hour: 14, minute: 0 }
    };

    // 1. Streak Saver
    const streakCron = `${schedules.streakSaver.minute} ${schedules.streakSaver.hour} * * *`;
    const streakTask = cron.schedule(streakCron, async () => {
        console.log('Running Streak Saver Job...');
        await checkStreaksAndNotify();
    });
    scheduledTasks.push(streakTask);

    // 2. Daily Reward Reminder
    const rewardCron = `${schedules.dailyReward.minute} ${schedules.dailyReward.hour} * * *`;
    const rewardTask = cron.schedule(rewardCron, () => {
        console.log('⏰ Running Daily Reward Reminder...');
        sendDailyRewardReminders();
    });
    scheduledTasks.push(rewardTask);

    // 3. Random Wisdom/Fact
    const wisdomCron = `${schedules.dailyWisdom.minute} ${schedules.dailyWisdom.hour} * * *`;
    const wisdomTask = cron.schedule(wisdomCron, async () => {
        console.log('⏰ Running Daily Wisdom...');
        try {
            const contentPath = path.join(__dirname, '../data/notifications-content.json');
            const fileData = fs.readFileSync(contentPath, 'utf8');
            const content = JSON.parse(fileData);

            const items = [...(content.quotes || []), ...(content.facts || [])];
            if (items.length > 0) {
                const randomIndex = Math.floor(Math.random() * items.length);
                const randomItem = items[randomIndex];

                console.log(`Selected item index ${randomIndex}: ${randomItem.text.substring(0, 30)}...`);

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
    scheduledTasks.push(wisdomTask);
};

/**
 * Restart cron jobs (used when settings change)
 */
exports.restartCronJobs = async () => {
    await exports.initCronJobs();
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
