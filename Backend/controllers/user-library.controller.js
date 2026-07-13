const UserLibrary = require('../models/UserLibrary.model');
const Ebook = require('../models/Ebook.model');
const Subscription = require('../models/Subscription.model');
const axios = require('axios');

// Get user's library
exports.getUserLibrary = async (req, res) => {
    try {
        const userId = req.user._id;

        const library = await UserLibrary.find({ userId })
            .populate('ebookId')
            .sort({ acquiredDate: -1 });

        res.json({
            success: true,
            count: library.length,
            data: library
        });
    } catch (error) {
        console.error('Error fetching user library:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب المكتبة',
            error: error.message
        });
    }
};

// Add ebook to library (purchase)
exports.addToLibrary = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId, acquiredVia = 'purchase', pricePaid } = req.body;

        // Check if ebook exists
        const ebook = await Ebook.findById(ebookId);
        if (!ebook) {
            return res.status(404).json({
                success: false,
                message: 'الكتاب الإلكتروني غير موجود'
            });
        }

        // Check if already in library
        const existing = await UserLibrary.findOne({ userId, ebookId });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'الكتاب موجود في مكتبتك بالفعل'
            });
        }

        // Add to library
        const libraryEntry = await UserLibrary.create({
            userId,
            ebookId,
            acquiredVia,
            pricePaid: pricePaid || ebook.price
        });

        // Trigger book recommendation workflow for purchase events
        if (acquiredVia === 'purchase') {
            try {
                await axios.post('https://n8n.knoozbook.com/webhook/book-recommendation', {
                    userId: userId.toString(),
                    eventType: 'purchase',
                    bookId: ebookId.toString()
                });
                console.log('[UserLibrary] Book recommendation workflow triggered for user:', userId);
            } catch (webhookError) {
                console.error('[UserLibrary] Failed to trigger book recommendation workflow:', webhookError.message);
                // Don't fail the purchase if webhook fails
            }
        }

        res.status(201).json({
            success: true,
            message: 'تمت إضافة الكتاب إلى مكتبتك بنجاح',
            data: libraryEntry
        });
    } catch (error) {
        console.error('Error adding to library:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إضافة الكتاب إلى المكتبة',
            error: error.message
        });
    }
};

// Check if user has access to ebook
exports.checkAccess = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId } = req.params;

        // Check subscription (Primary: Subscription model, Fallback: User model)
        const subscription = await Subscription.findActiveSubscription(userId);
        const hasUserSubscription = req.user.activeSubscription && 
                                   req.user.subscriptionEndDate && 
                                   new Date(req.user.subscriptionEndDate) > new Date();

        if (subscription || hasUserSubscription) {
            return res.json({
                success: true,
                hasAccess: true,
                accessType: 'subscription',
                subscription: subscription || { 
                    status: 'active', 
                    endDate: req.user.subscriptionEndDate,
                    plan: 'special_offer'
                }
            });
        }

        // Handle external books (Shamela) - require subscription for full access
        // Since they don't exist in local DB, check subscription status
        if (ebookId.startsWith('ext')) {
            // If user has no active subscription, give preview access only
            return res.json({
                success: true,
                hasAccess: false,
                accessType: 'preview'
            });
        }

        // Check ownership
        const libraryEntry = await UserLibrary.findOne({ userId, ebookId });
        if (libraryEntry) {
            // Update access tracking
            libraryEntry.lastAccessedAt = new Date();
            libraryEntry.accessCount += 1;
            await libraryEntry.save();

            return res.json({
                success: true,
                hasAccess: true,
                accessType: 'owned',
                acquiredVia: libraryEntry.acquiredVia
            });
        }

        // Check if preview is available
        const ebook = await Ebook.findById(ebookId);
        if (ebook && ebook.miniEpubFilePath) {
            return res.json({
                success: true,
                hasAccess: true,
                accessType: 'preview'
            });
        }

        res.json({
            success: true,
            hasAccess: false
        });
    } catch (error) {
        console.error('Error checking access:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في التحقق من الصلاحية',
            error: error.message
        });
    }
};

// Check public access for preview (no login required)
exports.checkPublicAccess = async (req, res) => {
    try {
        const { ebookId } = req.params;

        // Check if preview is available
        const ebook = await Ebook.findById(ebookId);
        if (ebook && ebook.miniEpubFilePath) {
            return res.json({
                success: true,
                hasAccess: true,
                accessType: 'preview'
            });
        }

        res.json({
            success: true,
            hasAccess: false
        });
    } catch (error) {
        console.error('Error checking public access:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في التحقق من الصلاحية',
            error: error.message
        });
    }
};

// Remove from library
exports.removeFromLibrary = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ebookId } = req.params;

        const result = await UserLibrary.findOneAndDelete({ userId, ebookId });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'الكتاب غير موجود في مكتبتك'
            });
        }

        res.json({
            success: true,
            message: 'تم حذف الكتاب من مكتبتك'
        });
    } catch (error) {
        console.error('Error removing from library:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف الكتاب من المكتبة',
            error: error.message
        });
    }
};
