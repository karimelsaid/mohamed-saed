const User = require('../models/User.model');
const Donation = require('../models/Donation.model');
const SystemSettings = require('../models/SystemSettings');

// Fallback points if settings are not found
const DEFAULT_POINTS = {
    MINUTE_READING: 1,      // دقيقة قراءة
    VERSE_MEMORIZED: 5,     // حفظ آية
    PAGE_COMPLETE: 10,      // إكمال صفحة
    HIZB_COMPLETE: 50,      // إكمال حزب
    JUZ_COMPLETE: 100,      // إكمال جزء
    DAILY_STREAK: 20,       // التزام يومي
    KHATMA_COMPLETE: 1000,  // ختم القرآن
    REVISION_PAGE_COMPLETE: 5, // مراجعة صفحة
    REVISION_VERSE_COMPLETE: 2, // مراجعة آية
    POINTS_PER_EGP: 500,       // معامل تحويل النقاط (500 نقطة = 1 جنيه)
    MIN_CONVERSION_POINTS: 5   // الحد الأدنى للتحويل (5 نقاط = 1 قرش)
};

// الحصول على تقدم المستخدم
const getProgress = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('quranProgress');
        const settings = await SystemSettings.getInstance();

        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        res.json({
            success: true,
            progress: user.quranProgress || {
                totalPoints: 0,
                dailyStreak: 0,
                pagesRead: 0,
                versesMemorized: 0,
                totalMinutesReading: 0,
                khatmatCount: 0,
                lastPage: 1
            },
            economy: settings.economy // Include economy settings for points-to-EGP rate
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
};

// تحديث النقاط
const addPoints = async (req, res) => {
    try {
        const userId = req.user._id;
        const { activity, count } = req.body;
        const validCount = parseInt(count) || 1;
        const settings = await SystemSettings.getInstance();
        const pointsConfig = settings.quranPoints || {};

        const pointsPerUnit = pointsConfig[activity] || DEFAULT_POINTS[activity] || 0;
        const pointsToAdd = pointsPerUnit * validCount;

        if (pointsToAdd === 0) {
            return res.status(400).json({ message: 'نشاط غير صالح أو قيمة النقاط صفر' });
        }

        const update = {
            $inc: { 'quranProgress.totalPoints': pointsToAdd },
            $set: { 'quranProgress.lastActivityDate': new Date() }
        };

        // تحديثات إضافية حسب النشاط
        if (activity === 'PAGE_COMPLETE') {
            update.$inc['quranProgress.pagesRead'] = validCount;
        } else if (activity === 'VERSE_MEMORIZED') {
            update.$inc['quranProgress.versesMemorized'] = validCount;
        } else if (activity === 'MINUTE_READING') {
            update.$inc['quranProgress.totalMinutesReading'] = validCount;
        } else if (activity === 'KHATMA_COMPLETE') {
            update.$inc['quranProgress.khatmatCount'] = validCount;
        } else if (activity === 'REVISION_PAGE_COMPLETE') {
            update.$inc['quranProgress.pagesReviewed'] = validCount;
        } else if (activity === 'REVISION_VERSE_COMPLETE') {
            // Just points, or maybe we add a versesReviewed field later
        }

        const user = await User.findByIdAndUpdate(userId, update, { new: true });

        res.json({
            success: true,
            pointsAdded: pointsToAdd,
            totalPoints: user.quranProgress.totalPoints,
            message: `تمت إضافة ${pointsToAdd} نقطة`
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
};

// تحديث الالتزام اليومي
const updateStreak = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        const today = new Date().toDateString();
        const lastActivity = user.quranProgress?.lastActivityDate;
        const lastActivityDate = lastActivity ? new Date(lastActivity).toDateString() : null;

        let newStreak = user.quranProgress?.dailyStreak || 0;
        let pointsToAdd = 0;

        if (lastActivityDate !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            if (lastActivityDate === yesterday.toDateString()) {
                // استمرار السلسلة
                newStreak += 1;
            } else {
                // إعادة بدء السلسلة
                newStreak = 1;
            }

            const settings = await SystemSettings.getInstance();
            pointsToAdd = settings.quranPoints?.DAILY_STREAK || DEFAULT_POINTS.DAILY_STREAK;
        }

        const update = {
            'quranProgress.dailyStreak': newStreak,
            'quranProgress.lastActivityDate': new Date()
        };

        if (newStreak > (user.quranProgress?.longestStreak || 0)) {
            update['quranProgress.longestStreak'] = newStreak;
        }

        await User.findByIdAndUpdate(userId, {
            $set: update,
            $inc: { 'quranProgress.totalPoints': pointsToAdd }
        });

        res.json({
            success: true,
            streak: newStreak,
            pointsAdded: pointsToAdd
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
};

// تحديث آخر صفحة
const updateLastPage = async (req, res) => {
    try {
        const userId = req.user._id;
        const { pageNumber } = req.body;

        await User.findByIdAndUpdate(userId, {
            $set: {
                'quranProgress.lastPage': pageNumber,
                'quranProgress.lastActivityDate': new Date()
            }
        });

        res.json({ success: true, lastPage: pageNumber });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
};

// إضافة/إزالة bookmark
const toggleBookmark = async (req, res) => {
    try {
        const userId = req.user._id;
        const { pageNumber } = req.body;

        const user = await User.findById(userId);
        const bookmarks = user.quranProgress?.bookmarks || [];

        if (bookmarks.includes(pageNumber)) {
            // إزالة
            await User.findByIdAndUpdate(userId, {
                $pull: { 'quranProgress.bookmarks': pageNumber }
            });
            res.json({ success: true, action: 'removed', pageNumber });
        } else {
            // إضافة
            await User.findByIdAndUpdate(userId, {
                $addToSet: { 'quranProgress.bookmarks': pageNumber }
            });
            res.json({ success: true, action: 'added', pageNumber });
        }
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
};

// تحويل النقاط إلى رصيد (ج.م)
const convertPoints = async (req, res) => {
    try {
        const userId = req.user._id;
        const { points } = req.body;
        const settings = await SystemSettings.getInstance();
        const minPoints = settings.economy?.quranMinConversionPoints || DEFAULT_POINTS.MIN_CONVERSION_POINTS;
        const ptsPerEGP = settings.economy?.quranPointsPerEGP || DEFAULT_POINTS.POINTS_PER_EGP;

        if (!points || points < minPoints) {
            return res.status(400).json({ message: `الحد الأدنى للتحويل هو ${minPoints} نقاط` });
        }

        const user = await User.findById(userId);
        if (user.quranProgress.totalPoints < points) {
            return res.status(400).json({ message: 'رصيد النقاط غير كافٍ' });
        }

        const egpToAdd = points / ptsPerEGP;

        user.quranProgress.totalPoints -= points;
        user.quranProgress.walletBalance = (user.quranProgress.walletBalance || 0) + egpToAdd;
        await user.save();

        res.json({
            success: true,
            convertedPoints: points,
            addedBalance: egpToAdd,
            newTotalPoints: user.quranProgress.totalPoints,
            newBalance: user.quranProgress.walletBalance
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
};

// طلب سحب الرصيد (Payout Request)
const requestPayout = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        const balance = user.quranProgress.walletBalance || 0;

        // 1. الحد الأدنى للسحب
        if (balance < 20) {
            return res.status(400).json({ message: 'الحد الأدنى لطلب السحب هو 20 جنيه' });
        }

        // 2. تكرار الطلب (مرة واحدة في اليوم)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastRequest = user.paymentRequests
            .filter(r => r.createdAt)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

        if (lastRequest) {
            const lastDate = new Date(lastRequest.createdAt);
            lastDate.setHours(0, 0, 0, 0);

            if (lastDate.getTime() === today.getTime()) {
                return res.status(400).json({ message: 'عذراً، يمكنك تقديم طلب سحب واحد فقط في اليوم' });
            }
        }

        // إضافة الطلب لمصفوفة paymentRequests الخاصة بالمستخدم
        user.paymentRequests.push({
            amount: balance,
            status: 'pending',
            createdAt: new Date()
        });

        // تصفير الرصيد بعد تقديم الطلب
        user.quranProgress.walletBalance = 0;
        await user.save();

        res.json({
            success: true,
            amount: balance,
            message: 'تم تقديم طلب السحب بنجاح، سيتم مراجعته من قبل الإدارة'
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
}

// إنشاء تبرع
async function createDonation(req, res) {
    try {
        const amount = parseFloat(req.body.amount); // amount is now in EGP
        const message = req.body.message || '';
        const userId = req.user._id;

        if (!amount || amount < 0.01) {
            return res.status(400).json({ success: false, message: 'الحد الأدنى للتبرع هو 1 قرش (0.01 ج.م)' });
        }

        const user = await User.findById(userId);
        if (!user || (user.quranProgress.walletBalance || 0) < amount) {
            return res.status(400).json({ success: false, message: 'رصيد المحفظة غير كافٍ. يرجى تحويل النقاط إلى رصيد أولاً.' });
        }

        const donation = new Donation({
            userId,
            amount, // Store EGP value
            message,
            status: 'completed'
        });

        // Deduct EGP from wallet
        user.quranProgress.walletBalance -= amount;
        await user.save();
        await donation.save();

        res.json({
            success: true,
            message: 'تم تسجيل التبرع بنجاح، شكر الله لكم',
            donation,
            newBalance: user.quranProgress.walletBalance
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

module.exports = {
    getProgress,
    addPoints,
    updateStreak,
    updateLastPage,
    toggleBookmark,
    convertPoints,
    requestPayout,
    createDonation,
    POINTS: DEFAULT_POINTS
};
