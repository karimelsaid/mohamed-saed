const PartnershipSettings = require('../models/PartnershipSettings');
const Partner = require('../models/Partner');
const PartnershipApplication = require('../models/PartnershipApplication');
const Investment = require('../models/Investment');
const Contract = require('../models/Contract');
const Payment = require('../models/Payment');
const Shareholder = require('../models/Shareholder');
const DailyProfitRecord = require('../models/DailyProfitRecord');
const PartnerProfitRecord = require('../models/PartnerProfitRecord');

exports.getSettings = async (req, res) => {
    try {
        const settings = await PartnershipSettings.findOne().sort({ createdAt: -1 });
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        let settings = await PartnershipSettings.findOne().sort({ createdAt: -1 });
        if (settings) {
            // Update existing (or create new version depending on business logic, here we just update)
            Object.assign(settings, req.body);
            settings.updatedBy = req.admin._id;
            await settings.save();
        } else {
            settings = new PartnershipSettings({ ...req.body, updatedBy: req.admin._id });
            await settings.save();
        }
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getApplications = async (req, res) => {
    try {
        const applications = await PartnershipApplication.find().populate('partnerId');
        res.json({ success: true, applications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateApplicationStatus = async (req, res) => {
    try {
        const app = await PartnershipApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ success: false, message: 'Not found' });
        
        app.status = req.body.status;
        app.adminNotes = req.body.adminNotes || app.adminNotes;
        await app.save();
        
        res.json({ success: true, application: app });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.approvePartnership = async (req, res) => {
    try {
        const { id } = req.params;
        const app = await PartnershipApplication.findById(id).populate('partnerId');
        if (!app) return res.status(404).json({ success: false, message: 'Not found' });

        const settings = await PartnershipSettings.findOne().sort({ createdAt: -1 });
        
        // Create Investment
        const ownershipPercentage = (app.requestedShares / settings.totalShares) * 100;
        const investment = new Investment({
            partnerId: app.partnerId._id,
            roundId: settings._id,
            investmentAmount: app.investmentAmount,
            sharesPurchased: app.requestedShares,
            ownershipPercentage,
            companyValuationAtPurchase: settings.companyValuation,
            sharePriceAtPurchase: settings.sharePrice,
            totalSharesAtPurchase: settings.totalShares,
            status: 'ACTIVE',
            approvedAt: new Date(),
            approvedBy: req.admin._id,
            activatedAt: new Date(),
            cancellationDeadline: new Date(Date.now() + settings.cancellationPeriodDays * 24 * 60 * 60 * 1000)
        });
        await investment.save();

        // Create Shareholder record
        const shareholder = new Shareholder({
            partnerId: app.partnerId._id,
            shares: app.requestedShares,
            ownershipPercentage
        });
        await shareholder.save();
        
        // Update application and partner status
        app.status = 'APPROVED';
        await app.save();
        
        const partner = await Partner.findById(app.partnerId._id);
        partner.status = 'ACTIVE';
        await partner.save();

        res.json({ success: true, investment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ... add stub methods for remaining admin features (profits, cap table)
exports.getCapTable = async (req, res) => {
    try {
        const shareholders = await Shareholder.find().populate('partnerId');
        res.json({ success: true, shareholders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
