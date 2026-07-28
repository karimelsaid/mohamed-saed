const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const User = require('../models/User.model'); // Adjust path as needed
const pushNotificationService = require('./push-notification.service');
const { detectAndUpdateLiveVersion } = require('../utils/live-update-detector');

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

    // 4. Custom Quran Reminders (Every minute)
    const customRemindersTask = cron.schedule('* * * * *', () => {
        // console.log('⏰ Checking Custom Quran Reminders...');
        processCustomReminders();
    });
    scheduledTasks.push(customRemindersTask);

    // 5. Automated Live Update Detection (Every 5 minutes)
    const liveUpdateTask = cron.schedule('*/5 * * * *', async () => {
        console.log('🔄 Running Automated Live Update Detection...');
        await detectAndUpdateLiveVersion();
    });
    scheduledTasks.push(liveUpdateTask);

    // 6. Bourse Offers Generation (Every 45 minutes to ensure health)
    const bourseTask = cron.schedule('*/45 * * * *', async () => {
        console.log('🔄 Checking Bourse Generation...');
        try {
            const SystemSettingsLocal = require('../models/SystemSettings');
            const BourseOffer = require('../models/BourseOffer.model');
            const BourseController = require('../controllers/bourse.controller');
            const localSettings = await SystemSettingsLocal.getInstance();
            
            if (localSettings.bourseConfig && localSettings.bourseConfig.isActive) {
               const now = new Date();
               // Force Egypt Time (UTC+3)
               const EGYPT_OFFSET = 3 * 60 * 60 * 1000;
               const egyptDate = new Date(now.getTime() + EGYPT_OFFSET);
               const dateStr = egyptDate.toISOString().split('T')[0];

               const offersCount = await BourseOffer.countDocuments({ date: dateStr });
               if (offersCount < 32) {
                 console.log(`[Cron] Found ${offersCount} offers for ${dateStr}. Regenerating full day...`);
                 await BourseOffer.deleteMany({ date: dateStr });
                 await BourseController.generateDailyBourseOffers(dateStr, localSettings.bourseConfig);
               }
            }
        } catch(err) {
            console.error('Error in bourse generation job:', err);
        }
    });
    scheduledTasks.push(bourseTask);

    // 7. Amazon pending ASIN check (Every 15 minutes)
    const amazonPendingTask = cron.schedule('*/15 * * * *', async () => {
        // console.log('🔄 Checking Amazon pending ASINs...');
        try {
            const Product = require('../models/Product.model');
            // Since this is in services/ use the correct relative path
            const amazonPolling = require('./amazon/amazon-polling.service');
            
            const pendingProducts = await Product.find({ amazonStatus: 'pending_asin' }).limit(50);
            
            for (const product of pendingProducts) {
                if (product.amazonSku) {
                    const statusResult = await amazonPolling.getProductStatus(product.amazonSku);
                    if (statusResult.asin) {
                        console.log(`✅ [Amazon Cron] ASIN generated for ${product.products_id}: ${statusResult.asin}`);
                        product.amazonAsin = statusResult.asin;
                        product.amazonStatus = 'published';
                        product.amazonSyncedAt = new Date();
                        await product.save();
                    } else if (statusResult.status === 'PERMANENT_ERROR' || statusResult.status === 'INVALID') {
                        console.log(`❌ [Amazon Cron] ASIN failed for ${product.products_id}`);
                        product.amazonStatus = 'failed';
                        product.amazonLastError = 'Rejected by Amazon';
                        await product.save();
                    }
                }
            }
        } catch(err) {
            console.error('Error in amazon pending check job:', err);
        }
    });
    scheduledTasks.push(amazonPendingTask);
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

/**
 * Process custom reminders for all users
 */
async function processCustomReminders() {
    try {
        const now = new Date();
        const egyptOffset = 2 * 60; // UTC+2
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const egyptTime = new Date(utc + (egyptOffset * 60000));

        const hours = String(egyptTime.getHours()).padStart(2, '0');
        const minutes = String(egyptTime.getMinutes()).padStart(2, '0');
        const currentTimeStr = `${hours}:${minutes}`;

        // Fetch users matching any of the active reminder schedules for the current minute in a single query
        const users = await User.find({
            $or: [
                {
                    'hifzPlan.reminders.recitation.enabled': true,
                    'hifzPlan.reminders.recitation.time': currentTimeStr
                },
                {
                    'hifzPlan.reminders.memorization.enabled': true,
                    'hifzPlan.reminders.memorization.time': currentTimeStr
                },
                {
                    'hifzPlan.reminders.revision.enabled': true,
                    'hifzPlan.reminders.revision.time': currentTimeStr
                }
            ]
        }).select('_id hifzPlan.reminders').lean();

        if (users.length === 0) {
            return;
        }

        const recitationUsers = [];
        const memorizationUsers = [];
        const revisionUsers = [];

        users.forEach(user => {
            const reminders = user.hifzPlan?.reminders;
            if (reminders) {
                if (reminders.recitation?.enabled && reminders.recitation?.time === currentTimeStr) {
                    recitationUsers.push(user);
                }
                if (reminders.memorization?.enabled && reminders.memorization?.time === currentTimeStr) {
                    memorizationUsers.push(user);
                }
                if (reminders.revision?.enabled && reminders.revision?.time === currentTimeStr) {
                    revisionUsers.push(user);
                }
            }
        });

        // 1. Recitation Reminders
        if (recitationUsers.length > 0) {
            const payload = {
                notification: {
                    title: '📖 ورد التلاوة',
                    body: 'حان الآن موعد ورد التلاوة اليومي. افتح المصحف وابدأ رحلتك.',
                    icon: '/assets/icons/icon-192x192.png',
                    data: { url: '/mushaf' }
                }
            };
            for (const user of recitationUsers) {
                await pushNotificationService.sendToUser(user._id, payload);
            }
        }

        // 2. Memorization Reminders
        if (memorizationUsers.length > 0) {
            const payload = {
                notification: {
                    title: '🧠 ورد الحفظ الجديد',
                    body: 'حان موعد حفظ آياتك الجديدة اليوم. استعن بالله وابدأ.',
                    icon: '/assets/icons/icon-192x192.png',
                    data: { url: '/mushaf' }
                }
            };
            for (const user of memorizationUsers) {
                await pushNotificationService.sendToUser(user._id, payload);
            }
        }

        // 3. Revision Reminders
        if (revisionUsers.length > 0) {
            const payload = {
                notification: {
                    title: '📚 ورد المراجعة',
                    body: 'موعد مراجعة محفوظاتك الآن. المراجعة هي سر الثبات.',
                    icon: '/assets/icons/icon-192x192.png',
                    data: { url: '/mushaf' }
                }
            };
            for (const user of revisionUsers) {
                await pushNotificationService.sendToUser(user._id, payload);
            }
        }

    } catch (error) {
        console.error('Error in processCustomReminders:', error);
    }
}
