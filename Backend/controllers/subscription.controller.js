const Subscription = require('../models/Subscription.model');
const User = require('../models/User.model');

// Get user's subscription status
exports.getSubscriptionStatus = async (req, res) => {
    try {
        const userId = req.user._id;

        const subscription = await Subscription.findActiveSubscription(userId);

        if (!subscription) {
            return res.json({
                success: true,
                hasSubscription: false,
                message: 'لا يوجد اشتراك نشط'
            });
        }

        res.json({
            success: true,
            hasSubscription: true,
            data: subscription
        });
    } catch (error) {
        console.error('Error fetching subscription status:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب حالة الاشتراك',
            error: error.message
        });
    }
};

// Create new subscription
exports.subscribe = async (req, res) => {
    try {
        const userId = req.user._id;
        const { plan = 'monthly', paymentMethod } = req.body;

        // Check if user already has active subscription
        const existingSubscription = await Subscription.findActiveSubscription(userId);

        if (existingSubscription) {
            return res.status(400).json({
                success: false,
                message: 'لديك اشتراك نشط بالفعل'
            });
        }

        // Calculate dates and price
        const startDate = new Date();
        const endDate = new Date();
        let price;

        if (plan === 'monthly') {
            endDate.setMonth(endDate.getMonth() + 1);
            price = 50; // 50 EGP per month
        } else if (plan === 'yearly') {
            endDate.setFullYear(endDate.getFullYear() + 1);
            price = 500; // 500 EGP per year
        }

        // Create subscription
        const subscription = await Subscription.create({
            userId,
            plan,
            status: 'pending',
            startDate,
            endDate,
            price,
            paymentMethod,
            paymentStatus: 'pending'
        });

        // Create payment session using direct function call
        try {
            console.log('🔄 Creating payment session for subscription:', subscription._id);

            const paymentController = require('./payment.controller');

            // Create mock request/response objects
            const mockReq = {
                body: {
                    amount: price,
                    currency: 'EGP',
                    subscriptionId: subscription._id,
                    customerEmail: req.user.email,
                    merchantRedirect: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/subscription/callback`
                }
            };

            let paymentResult = null;
            let paymentError = null;

            const mockRes = {
                status: function (code) {
                    return {
                        json: function (data) {
                            if (code === 200) {
                                paymentResult = data;
                            } else {
                                paymentError = data;
                            }
                        }
                    };
                },
                json: function (data) {
                    paymentResult = data;
                }
            };

            // Call payment controller directly
            await paymentController.createSubscriptionPaymentSession(mockReq, mockRes);

            console.log('✅ Payment controller result:', paymentResult);

            if (paymentError || !paymentResult || !paymentResult.sessionUrl) {
                throw new Error(paymentError?.error || 'No payment session URL returned');
            }

            const paymentSessionUrl = paymentResult.sessionUrl;

            res.status(201).json({
                success: true,
                message: 'تم إنشاء الاشتراك بنجاح',
                data: subscription,
                paymentRequired: true,
                paymentSessionUrl: paymentSessionUrl
            });

        } catch (paymentError) {
            console.error('❌ Payment session creation failed:', paymentError.message);

            // Delete the failed subscription
            await Subscription.findByIdAndDelete(subscription._id);

            return res.status(500).json({
                success: false,
                message: 'فشل تحضير نظام الدفع. يرجى المحاولة مرة أخرى.',
                error: paymentError.message
            });
        }
    } catch (error) {
        console.error('Error creating subscription:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إنشاء الاشتراك',
            error: error.message
        });
    }
};

// Activate subscription after payment
exports.activateSubscription = async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const userId = req.user._id;

        const subscription = await Subscription.findOne({
            _id: subscriptionId,
            userId: userId
        });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'الاشتراك غير موجود'
            });
        }

        // Update subscription status
        subscription.status = 'active';
        subscription.paymentStatus = 'completed';
        await subscription.save();

        // Update user's subscription fields
        await User.findByIdAndUpdate(userId, {
            activeSubscription: true,
            subscriptionEndDate: subscription.endDate
        });

        res.json({
            success: true,
            message: 'تم تفعيل الاشتراك بنجاح',
            data: subscription
        });
    } catch (error) {
        console.error('Error activating subscription:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تفعيل الاشتراك',
            error: error.message
        });
    }
};

// Renew subscription
exports.renewSubscription = async (req, res) => {
    try {
        const userId = req.user._id;
        const { paymentMethod } = req.body;

        // Find the most recent subscription
        const lastSubscription = await Subscription.findOne({ userId })
            .sort({ endDate: -1 });

        if (!lastSubscription) {
            return res.status(404).json({
                success: false,
                message: 'لا يوجد اشتراك سابق'
            });
        }

        // Calculate new dates
        const startDate = new Date();
        const endDate = new Date();
        let price;

        if (lastSubscription.plan === 'monthly') {
            endDate.setMonth(endDate.getMonth() + 1);
            price = 50;
        } else if (lastSubscription.plan === 'yearly') {
            endDate.setFullYear(endDate.getFullYear() + 1);
            price = 500;
        }

        // Create new subscription
        const newSubscription = await Subscription.create({
            userId,
            plan: lastSubscription.plan,
            status: 'pending',
            startDate,
            endDate,
            price,
            paymentMethod,
            paymentStatus: 'pending'
        });

        res.status(201).json({
            success: true,
            message: 'تم إنشاء طلب التجديد بنجاح',
            data: newSubscription,
            paymentRequired: true
        });
    } catch (error) {
        console.error('Error renewing subscription:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تجديد الاشتراك',
            error: error.message
        });
    }
};

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
    try {
        const userId = req.user._id;
        const { reason } = req.body;

        const subscription = await Subscription.findActiveSubscription(userId);

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'لا يوجد اشتراك نشط للإلغاء'
            });
        }

        // Update subscription
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        subscription.cancellationReason = reason;
        await subscription.save();

        // Update user
        await User.findByIdAndUpdate(userId, {
            activeSubscription: false,
            subscriptionEndDate: null
        });

        res.json({
            success: true,
            message: 'تم إلغاء الاشتراك بنجاح'
        });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إلغاء الاشتراك',
            error: error.message
        });
    }
};

// Get all subscriptions (admin)
exports.getAllSubscriptions = async (req, res) => {
    try {
        const { status, plan } = req.query;

        let query = {};
        if (status) query.status = status;
        if (plan) query.plan = plan;

        const subscriptions = await Subscription.find(query)
            .populate('userId', 'username email')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: subscriptions.length,
            data: subscriptions
        });
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الاشتراكات',
            error: error.message
        });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const userId = req.user._id;

        const subscriptions = await Subscription.find({ userId })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: subscriptions.length,
            data: subscriptions
        });
    } catch (error) {
        console.error('Error fetching subscription history:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب سجل الاشتراكات',
            error: error.message
        });
    }
};
