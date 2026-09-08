const express = require('express');
const router = express.Router();
const MobileVersion = require('../models/MobileVersion.model');
const fs = require('fs');
const path = require('path');

router.get('/', async (req, res) => {
    try {
        const appType = req.query.app || 'kenouz';
        
        // Find the configuration document for this specific app
        let config = await MobileVersion.findOne({ app: appType });

        // Backward compatibility: if we are looking for 'kenouz' and no 'kenouz' doc exists but a doc with NO 'app' field exists, migrate it!
        if (!config && appType === 'kenouz') {
            config = await MobileVersion.findOne({ app: { $exists: false } });
            if (config) {
                config.app = 'kenouz';
                await config.save();
                console.log('Migrated existing MobileVersion singleton config to app = kenouz');
            }
        }

        // If not found, create default (Bootstrap)
        if (!config) {
            config = await MobileVersion.create({
                app: appType,
                android: {
                    minBuildNumber: appType === 'mushaf' ? 1 : 8,
                    storeUrl: appType === 'mushaf' ? 'https://play.google.com/store/apps/details?id=com.kenouz.mushaf' : 'https://play.google.com/store/apps/details?id=com.kenouz.bookstore2',
                    forceUpdate: true
                },
                ios: {
                    minBuildNumber: 1,
                    storeUrl: '',
                    forceUpdate: false
                },
                liveUpdate: {
                    version: '1.0.0',
                    zipUrl: appType === 'mushaf' ? 'https://knoozbook.com/mushaf-bundle.zip' : 'https://knoozbook.com/bundle.zip',
                    enabled: false
                }
            });
            console.log(`Initialized MobileVersion config for app = ${appType} in DB`);
        }

        // Convert to plain object to attach dynamic fields
        const responseData = config.toObject();

        // Dynamically calculate the bundle size on the server
        let projectRoot = __dirname;
        while (projectRoot !== path.parse(projectRoot).root) {
            if (fs.existsSync(path.join(projectRoot, 'package.json'))) break;
            projectRoot = path.join(projectRoot, '..');
        }

        const fileName = appType === 'mushaf' ? 'mushaf-bundle.zip' : 'bundle.zip';
        const possibleZipPaths = [
            path.join(projectRoot, 'Backend/dist/browser', fileName),
            path.join(projectRoot, 'dist/browser', fileName),
            path.join(projectRoot, 'dist/mobile/browser', fileName),
            path.join(projectRoot, 'dist', fileName),
            path.join(projectRoot, fileName)
        ];

        let sizeBytes = appType === 'mushaf' ? 5.5 * 1024 * 1024 : 4.2 * 1024 * 1024; // Default fallbacks
        let sizeFormatted = appType === 'mushaf' ? '5.50 MB' : '4.20 MB';

        for (const p of possibleZipPaths) {
            if (fs.existsSync(p)) {
                try {
                    const stats = fs.statSync(p);
                    sizeBytes = stats.size;
                    sizeFormatted = (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
                    break;
                } catch (e) {
                    console.error('Error reading stats for ZIP path:', p, e.message);
                }
            }
        }

        if (responseData.liveUpdate) {
            responseData.liveUpdate.sizeBytes = sizeBytes;
            responseData.liveUpdate.sizeFormatted = sizeFormatted;
            // Add cache-busting query param so Cloudflare CDN doesn't serve stale zip for new versions
            if (responseData.liveUpdate.zipUrl && responseData.liveUpdate.version) {
                const baseUrl = responseData.liveUpdate.zipUrl.split('?')[0];
                responseData.liveUpdate.zipUrl = `${baseUrl}?v=${responseData.liveUpdate.version}`;
            }
        }

        res.json(responseData);
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
        const appType = req.query.app || 'kenouz';
        const { android, ios } = req.body;
        let config = await MobileVersion.findOne({ app: appType });

        if (!config) {
            // Check if migrating from an app-less config
            if (appType === 'kenouz') {
                config = await MobileVersion.findOne({ app: { $exists: false } });
            }
            if (!config) {
                config = new MobileVersion({ app: appType });
            } else {
                config.app = 'kenouz';
            }
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
