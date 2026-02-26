const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');
const adminController = require('../controllers/admin.controller'); // Import controller

// Middleware to check if user is Admin
const authenticateAdmin = require('../middleware/admin.auth');

// GET /admin/settings - Fetch current settings (or create default)
router.get('/', async (req, res) => {
    try {
        const settings = await SystemSettings.getInstance();
        res.status(200).json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching settings', error: error.message });
    }
});

// GET /api/admin/settings/free-shipping-rules - Publicly accessible for calculation
router.get('/free-shipping-rules', adminController.getFreeShippingRules);

// GET /api/admin/settings/printing - Publicly accessible for printing calculation
router.get('/printing', async (req, res) => {
    try {
        const settings = await SystemSettings.getInstance();
        res.status(200).json(settings.printing);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching printing settings', error: error.message });
    }
});

// PUT /admin/settings - Update settings (Admin only)
router.put('/', authenticateAdmin, async (req, res) => {
    try {
        const { gamification, quranPoints, economy, maintenanceMode } = req.body;

        let settings = await SystemSettings.getInstance();

        if (gamification) settings.gamification = { ...settings.gamification, ...gamification };
        if (req.body.quranPoints) settings.quranPoints = { ...settings.quranPoints, ...req.body.quranPoints };
        if (economy) settings.economy = { ...settings.economy, ...economy };

        if (req.body.printing) {
            console.log('Updating printing settings:', JSON.stringify(req.body.printing, null, 2));

            // Use set for deep update and mark paths as modified
            settings.set('printing', req.body.printing);
            settings.markModified('printing');
            settings.markModified('printing.paperTypes');
            settings.markModified('printing.printers');
            settings.markModified('printing.coverPrices');

            // Cleanup old fields from Mongoose document
            settings.set('printing.paperPrices', undefined);
            settings.set('printing.printColorPrices', undefined);
        }

        if (req.body.subscription) settings.subscription = { ...settings.subscription, ...req.body.subscription };
        if (typeof maintenanceMode !== 'undefined') settings.maintenanceMode = maintenanceMode;

        if (req.body.notificationSchedules) {
            settings.notificationSchedules = { ...settings.notificationSchedules, ...req.body.notificationSchedules };
        }

        const updatedSettings = await settings.save();

        if (req.body.notificationSchedules) {
            // Restart cron jobs
            const cronJobsService = require('../services/cron-jobs.service');
            await cronJobsService.restartCronJobs();
        }

        res.status(200).json({ message: 'Settings updated successfully', settings: updatedSettings });
    } catch (error) {
        console.error('Save Error:', error);
        res.status(500).json({ message: 'Error updating settings', error: error.message });
    }
});

module.exports = router;
