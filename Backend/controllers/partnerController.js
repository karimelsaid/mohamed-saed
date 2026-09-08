const PartnershipSettings = require('../models/PartnershipSettings');
const Partner = require('../models/Partner');
const PartnershipApplication = require('../models/PartnershipApplication');
const Investment = require('../models/Investment');
const PartnerProfitRecord = require('../models/PartnerProfitRecord');

exports.getSettings = async (req, res) => {
    try {
        const settings = await PartnershipSettings.findOne().sort({ createdAt: -1 });
        if (!settings || settings.status === 'CLOSED') {
            return res.json({ success: true, settings: { status: 'CLOSED' } });
        }
        
        // Return only public settings
        res.json({
            success: true,
            settings: {
                status: settings.status,
                companyValuation: settings.companyValuation,
                sharePrice: settings.sharePrice,
                availableShares: settings.availableShares,
                minimumInvestment: settings.minimumInvestment,
                description: settings.description
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.applyForPartnership = async (req, res) => {
    try {
        const { fullName, email, phone, partnerType, investmentAmount, requestedShares } = req.body;
        
        // Find or create Partner record
        let partner = await Partner.findOne({ userId: req.user._id });
        if (!partner) {
            partner = new Partner({
                userId: req.user._id,
                fullName,
                email,
                phone,
                partnerType
            });
            await partner.save();
        }

        // Basic validation against settings
        const settings = await PartnershipSettings.findOne().sort({ createdAt: -1 });
        if (settings.status !== 'OPEN') {
            return res.status(400).json({ success: false, message: 'Partnership is not currently open.' });
        }
        if (investmentAmount < settings.minimumInvestment) {
            return res.status(400).json({ success: false, message: 'Investment amount is below minimum.' });
        }
        if (requestedShares > settings.availableShares) {
            return res.status(400).json({ success: false, message: 'Requested shares exceed available shares.' });
        }

        const application = new PartnershipApplication({
            partnerId: partner._id,
            investmentAmount,
            requestedShares,
            status: 'NEW'
        });
        await application.save();

        res.json({ success: true, application });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getMyDashboard = async (req, res) => {
    try {
        const partner = await Partner.findOne({ userId: req.user._id });
        if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });

        const investments = await Investment.find({ partnerId: partner._id });
        const applications = await PartnershipApplication.find({ partnerId: partner._id }).sort({ createdAt: -1 });
        const profits = await PartnerProfitRecord.find({ partnerId: partner._id }).sort({ date: -1 }).limit(30);

        res.json({ success: true, partner, investments, applications, profits });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
