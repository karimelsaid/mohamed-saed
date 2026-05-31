const WhitelistedOffer = require('../models/WhitelistedOffer.model');
const User = require('../models/User.model');
const Subscription = require('../models/Subscription.model');

// --- Admin Methods ---

exports.getAllOffers = async (req, res) => {
    try {
        const offers = await WhitelistedOffer.find().sort({ createdAt: -1 });
        res.json({ success: true, data: offers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.addOffer = async (req, res) => {
    try {
        const { email, type, value, notes } = req.body;
        
        const existing = await WhitelistedOffer.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ success: false, message: 'هذا البريد الإلكتروني مسجل بالفعل في العروض الخاصة' });
        }

        const offer = await WhitelistedOffer.create({
            email: email.toLowerCase(),
            type,
            value,
            notes,
            addedBy: req.user._id
        });

        res.status(201).json({ success: true, data: offer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteOffer = async (req, res) => {
    try {
        await WhitelistedOffer.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم حذف العرض بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- User Methods ---

exports.checkMyOffer = async (req, res) => {
    try {
        const email = req.user.email.toLowerCase();
        const offer = await WhitelistedOffer.findOne({ email, isWelcomed: false });

        if (!offer) {
            return res.json({ success: true, hasOffer: false });
        }

        res.json({ success: true, hasOffer: true, data: offer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.acknowledgeOffer = async (req, res) => {
    try {
        const email = req.user.email.toLowerCase();
        const offer = await WhitelistedOffer.findOne({ email });

        if (offer) {
            offer.isWelcomed = true;
            await offer.save();
        }

        // If it's a lifetime or free access, we apply it immediately to the User model
        if (offer && (offer.type === 'lifetime' || offer.type === 'free_months' || offer.type === 'free_days')) {
            const endDate = new Date();
            if (offer.type === 'lifetime') {
                endDate.setFullYear(endDate.getFullYear() + 100);
            } else if (offer.type === 'free_months') {
                endDate.setMonth(endDate.getMonth() + offer.value);
            } else if (offer.type === 'free_days') {
                endDate.setDate(endDate.getDate() + offer.value);
            }

            // Update user
            await User.findByIdAndUpdate(req.user._id, {
                activeSubscription: true,
                subscriptionEndDate: endDate
            });

            // Create a subscription record for history
            await Subscription.create({
                userId: req.user._id,
                plan: offer.type,
                status: 'active',
                startDate: new Date(),
                endDate: endDate,
                price: 0,
                paymentStatus: 'completed',
                paymentMethod: 'special_offer'
            });

            offer.isClaimed = true;
            await offer.save();
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
