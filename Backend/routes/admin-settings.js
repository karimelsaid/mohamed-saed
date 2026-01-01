const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');
const adminController = require('../controllers/admin.controller'); // Import controller

// Middleware to check if user is Admin (Simplified for internal use, add auth middleware if needed)
// For now, we assume the frontend sends the token and app.js handles generic auth, 
// but strictly this should be protected.

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

// PUT /admin/settings - Update settings
router.put('/', async (req, res) => {
    try {
        const { gamification, quranPoints, economy, maintenanceMode } = req.body;

        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = new SystemSettings({});
        }

        if (gamification) settings.gamification = { ...settings.gamification, ...gamification };
        if (req.body.quranPoints) settings.quranPoints = { ...settings.quranPoints, ...req.body.quranPoints };
        if (economy) settings.economy = { ...settings.economy, ...economy };
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
        res.status(500).json({ message: 'Error updating settings', error: error.message });
    }
});

module.exports = router;
