const ReadingProgress = require('../models/ReadingProgress.model');

// Get reading progress for an ebook
exports.getProgress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId } = req.params;

        let progress = await ReadingProgress.findOne({ userId, ebookId });

        // If no progress exists, create initial progress
        if (!progress) {
            progress = await ReadingProgress.create({
                userId,
                ebookId,
                currentCfi: '',
                currentPage: 0,
                totalPages: 0,
                progressPercent: 0
            });
        }

        res.json({
            success: true,
            data: progress
        });
    } catch (error) {
        console.error('Error fetching reading progress:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب تقدم القراءة',
            error: error.message
        });
    }
};

// Update reading progress
exports.updateProgress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId } = req.params;
        const { currentCfi, currentPage, totalPages, progressPercent, readingTimeMinutes } = req.body;

        let progress = await ReadingProgress.findOne({ userId, ebookId });

        if (!progress) {
            // Create new progress
            progress = await ReadingProgress.create({
                userId,
                ebookId,
                currentCfi,
                currentPage,
                totalPages,
                progressPercent,
                readingTimeMinutes
            });
        } else {
            // Update existing progress
            if (currentCfi !== undefined) progress.currentCfi = currentCfi;
            if (currentPage !== undefined) progress.currentPage = currentPage;
            if (totalPages !== undefined) progress.totalPages = totalPages;
            if (progressPercent !== undefined) progress.progressPercent = progressPercent;
            if (readingTimeMinutes !== undefined) {
                progress.readingTimeMinutes = (progress.readingTimeMinutes || 0) + readingTimeMinutes;
            }

            await progress.save();
        }

        res.json({
            success: true,
            message: 'تم حفظ التقدم بنجاح',
            data: progress
        });
    } catch (error) {
        console.error('Error updating reading progress:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حفظ التقدم',
            error: error.message
        });
    }
};

// Update reader settings
exports.updateSettings = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId } = req.params;
        const settings = req.body;

        let progress = await ReadingProgress.findOne({ userId, ebookId });

        if (!progress) {
            progress = await ReadingProgress.create({
                userId,
                ebookId,
                settings
            });
        } else {
            progress.settings = { ...progress.settings, ...settings };
            await progress.save();
        }

        res.json({
            success: true,
            message: 'تم حفظ الإعدادات بنجاح',
            data: progress
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حفظ الإعدادات',
            error: error.message
        });
    }
};

// Add bookmark
exports.addBookmark = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId } = req.params;
        const { cfi, label } = req.body;

        let progress = await ReadingProgress.findOne({ userId, ebookId });

        if (!progress) {
            progress = await ReadingProgress.create({
                userId,
                ebookId,
                bookmarks: [{ cfi, label }]
            });
        } else {
            await progress.addBookmark(cfi, label);
        }

        res.json({
            success: true,
            message: 'تمت إضافة الإشارة المرجعية بنجاح',
            data: progress
        });
    } catch (error) {
        console.error('Error adding bookmark:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إضافة الإشارة المرجعية',
            error: error.message
        });
    }
};

// Remove bookmark
exports.removeBookmark = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId, bookmarkId } = req.params;

        const progress = await ReadingProgress.findOne({ userId, ebookId });

        if (!progress) {
            return res.status(404).json({
                success: false,
                message: 'لا يوجد تقدم قراءة'
            });
        }

        await progress.removeBookmark(bookmarkId);

        res.json({
            success: true,
            message: 'تم حذف الإشارة المرجعية بنجاح',
            data: progress
        });
    } catch (error) {
        console.error('Error removing bookmark:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف الإشارة المرجعية',
            error: error.message
        });
    }
};

// Add highlight
exports.addHighlight = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId } = req.params;
        const { cfi, text, color, note, cfiRange } = req.body;

        let progress = await ReadingProgress.findOne({ userId, ebookId });

        if (!progress) {
            progress = await ReadingProgress.create({
                userId,
                ebookId,
                highlights: [{ cfi, text, color, note, cfiRange }]
            });
        } else {
            await progress.addHighlight(cfi, text, color, note, cfiRange);
        }

        res.json({
            success: true,
            message: 'تمت إضافة التحديد بنجاح',
            data: progress
        });
    } catch (error) {
        console.error('Error adding highlight:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إضافة التحديد',
            error: error.message
        });
    }
};

// Remove highlight
exports.removeHighlight = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId, highlightId } = req.params;

        const progress = await ReadingProgress.findOne({ userId, ebookId });

        if (!progress) {
            return res.status(404).json({
                success: false,
                message: 'لا يوجد تقدم قراءة'
            });
        }

        await progress.removeHighlight(highlightId);

        res.json({
            success: true,
            message: 'تم حذف التحديد بنجاح',
            data: progress
        });
    } catch (error) {
        console.error('Error removing highlight:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف التحديد',
            error: error.message
        });
    }
};

// Get all bookmarks for an ebook
exports.getBookmarks = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId } = req.params;

        const progress = await ReadingProgress.findOne({ userId, ebookId });

        if (!progress) {
            return res.json({
                success: true,
                data: []
            });
        }

        res.json({
            success: true,
            data: progress.bookmarks
        });
    } catch (error) {
        console.error('Error fetching bookmarks:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الإشارات المرجعية',
            error: error.message
        });
    }
};

// Get all highlights for an ebook
exports.getHighlights = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId } = req.params;

        const progress = await ReadingProgress.findOne({ userId, ebookId });

        if (!progress) {
            return res.json({
                success: true,
                data: []
            });
        }

        res.json({
            success: true,
            data: progress.highlights
        });
    } catch (error) {
        console.error('Error fetching highlights:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب التحديدات',
            error: error.message
        });
    }
};
