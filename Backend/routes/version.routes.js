const express = require('express');
const router = express.Router();
const MobileVersion = require('../models/MobileVersion.model');

router.get('/', async (req, res) => {
    try {
        // Find the configuration document
        let config = await MobileVersion.findOne();

        // If not found, create default (Bootstrap)
        if (!config) {
            config = await MobileVersion.create({
                android: {
                    minBuildNumber: 8,
                    storeUrl: 'https://play.google.com/store/apps/details?id=com.kenouz.bookstore2',
                    forceUpdate: true
                },
                ios: {
                    minBuildNumber: 1,
                    storeUrl: '',
                    forceUpdate: false
                },
                liveUpdate: {
                    version: '1.0.0',
                    zipUrl: 'https://knoozbook.com/bundle.zip',
                    enabled: false
                }
            });
            console.log('Initialized MobileVersion config in DB');
        }

        res.json(config);
    } catch (error) {
        console.error('Error fetching mobile version:', error);
        // Fallback to hardcoded safe values if DB fails
        res.status(500).json({
            android: { minBuildNumber: 0, forceUpdate: false },
            ios: { minBuildNumber: 0, forceUpdate: false }
        });
    }
});

// Update configuration (Admin only - you should add auth middleware)
router.put('/', async (req, res) => {
    try {
        const { android, ios } = req.body;
        let config = await MobileVersion.findOne();

        if (!config) {
            config = new MobileVersion();
        }

        if (android) config.android = { ...config.android, ...android };
        if (ios) config.ios = { ...config.ios, ...ios };
        if (req.body.liveUpdate) config.liveUpdate = { ...config.liveUpdate, ...req.body.liveUpdate };

        await config.save();
        res.json(config);
    } catch (error) {
        console.error('Error updating mobile version:', error);
        res.status(500).json({ error: 'Failed to update version config' });
    }
});

module.exports = router;
