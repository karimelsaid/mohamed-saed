const fs = require('fs');
const path = require('path');
const MobileVersion = require('../models/MobileVersion.model');

/**
 * Utility to automatically detect if bundle.zip or mushaf-bundle.zip has been updated,
 * and update the database version accordingly.
 * Synchronization ensures Android, iOS, and Website share the same version.
 */
async function checkAppVersion(appType, fileName, zipUrlPath) {
    let projectRoot = __dirname;
    while (projectRoot !== path.parse(projectRoot).root) {
        if (fs.existsSync(path.join(projectRoot, 'package.json'))) break;
        projectRoot = path.join(projectRoot, '..');
    }

    const possibleZipPaths = [
        path.join(projectRoot, `Backend/dist/browser/${fileName}`),
        path.join(projectRoot, `dist/browser/${fileName}`),
        path.join(projectRoot, `dist/mobile/browser/${fileName}`),
        path.join(projectRoot, fileName)
    ];

    let newestZip = null;
    let newestStats = null;

    for (const p of possibleZipPaths) {
        if (fs.existsSync(p)) {
            const s = fs.statSync(p);
            if (!newestStats || s.mtime.getTime() > newestStats.mtime.getTime()) {
                newestZip = p;
                newestStats = s;
            }
        }
    }

    if (!newestZip) return;

    const currentMtime = newestStats.mtime;
    let config = await MobileVersion.findOne({ app: appType });
    if (!config) {
        // Migration fallback for legacy single-config document
        if (appType === 'kenouz') {
            config = await MobileVersion.findOne({ app: { $exists: false } });
        }
        if (!config) {
            config = new MobileVersion({ app: appType });
        } else {
            config.app = 'kenouz';
        }
    }

    const lastMtime = config.liveUpdate?.lastZipMtime;
    const isNewFile = !lastMtime || currentMtime.getTime() > new Date(lastMtime).getTime() + 1000;
    const needsSync = !config.android?.version || !config.ios?.version;

    if (isNewFile || needsSync) {
        console.log(`✨ [LiveUpdateDetector] New ${appType} bundle detected (${fileName}). Updating DB version...`);

        let currentVersion = config.liveUpdate?.version || '1.1.0';
        let versionParts = currentVersion.split('.');
        if (versionParts.length > 3) versionParts = versionParts.slice(0, 3);
        currentVersion = versionParts.join('.');

        let dbParts = currentVersion.split('.').map(Number);
        if (dbParts.length < 3) dbParts = [1, 1, 0];

        let newVersion = '';
        if (!isNewFile && needsSync) {
            newVersion = currentVersion;
        } else {
            newVersion = `${dbParts[0]}.${dbParts[1]}.${(dbParts[2] || 0) + 1}`;
        }

        config.liveUpdate = {
            ...config.liveUpdate,
            version: newVersion,
            enabled: true,
            zipUrl: zipUrlPath,
            lastZipMtime: currentMtime
        };

        if (config.android) config.android.version = newVersion;
        if (config.ios) config.ios.version = newVersion;

        await config.save();
        console.log(`✅ [LiveUpdateDetector] ${appType} liveUpdate version updated to: ${newVersion}`);
    }
}

async function detectAndUpdateLiveVersion() {
    try {
        await checkAppVersion('kenouz', 'bundle.zip', 'https://knoozbook.com/bundle.zip');
        await checkAppVersion('mushaf', 'mushaf-bundle.zip', 'https://knoozbook.com/mushaf-bundle.zip');
    } catch (error) {
        console.error('❌ [LiveUpdateDetector] Error synchronizing versions:', error.message);
    }
}

module.exports = { detectAndUpdateLiveVersion };
