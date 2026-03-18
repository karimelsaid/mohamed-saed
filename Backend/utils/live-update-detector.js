const fs = require('fs');
const path = require('path');
const MobileVersion = require('../models/MobileVersion.model');

/**
 * Utility to automatically detect if bundle.zip has been updated,
 * and update the database version accordingly using a 3-part format (e.g., 1.1.1).
 * Synchronization ensures Android, iOS, and Website share the same version.
 */
async function detectAndUpdateLiveVersion() {
    try {
        console.log('🔍 [LiveUpdateDetector] Starting detection check...');
        
        // Find project root by looking for package.json in current or parent directories
        let projectRoot = __dirname;
        while (projectRoot !== path.parse(projectRoot).root) {
            if (fs.existsSync(path.join(projectRoot, 'package.json'))) break;
            projectRoot = path.join(projectRoot, '..');
        }

        // Try multiple standard locations for bundle.zip and find the NEWEST one
        const possibleZipPaths = [
            path.join(projectRoot, 'Backend/dist/browser/bundle.zip'), // Primary path
            path.join(projectRoot, 'dist/browser/bundle.zip'),         // Fallback 1
            path.join(projectRoot, 'dist/mobile/browser/bundle.zip'),  // Fallback 2
            path.join(projectRoot, 'bundle.zip')                      // Fallback 3
        ];

        let newestZip = null;
        let newestStats = null;

        console.log(`🔍 [LiveUpdateDetector] Looking for bundle.zip in ${possibleZipPaths.length} locations...`);
        for (const p of possibleZipPaths) {
            if (fs.existsSync(p)) {
                const s = fs.statSync(p);
                console.log(`   ✅ FOUND: ${p} (Mtime: ${s.mtime.toISOString()})`);
                if (!newestStats || s.mtime.getTime() > newestStats.mtime.getTime()) {
                    newestZip = p;
                    newestStats = s;
                }
            } else {
                console.log(`   ❌ MISSING: ${p}`);
            }
        }
        
        const packageJsonPath = path.join(projectRoot, 'package.json');
        
        if (!newestZip) {
            console.warn('⚠️ [LiveUpdateDetector] bundle.zip NOT FOUND in any of these locations:');
            possibleZipPaths.forEach(p => console.log(`   - ${p}`));
            return;
        }

        const zipPath = newestZip;
        const stats = newestStats;
        const currentMtime = stats.mtime;

        let config = await MobileVersion.findOne();
        if (!config) {
            config = new MobileVersion();
            // Initialize with package.json version if new
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const baseVersion = pkg.version || '1.1.0';
                config.android.version = baseVersion;
                config.ios.version = baseVersion;
                config.liveUpdate.version = baseVersion;
            } catch (e) {}
        }

        // Check if we have a new file
        const lastMtime = config.liveUpdate?.lastZipMtime;
        
        // Robust mtime comparison
        const isNewFile = !lastMtime || currentMtime.getTime() > new Date(lastMtime).getTime() + 1000; // 1s buffer
        const needsSync = !config.android.version || !config.ios.version; 

        console.log(`✅ [LiveUpdateDetector] Newest bundle: ${zipPath}`);
        console.log(`   - File Mtime: ${currentMtime.toISOString()}`);
        console.log(`   - DB Last Mtime: ${lastMtime ? new Date(lastMtime).toISOString() : 'None'}`);
        console.log(`   - Is New: ${isNewFile}, Needs Sync: ${needsSync}`);
        
        if (isNewFile || needsSync) {
            console.log('✨ [LiveUpdateDetector] Update required. Calculating new version...');

            // 1. Get Base Version from package.json
            let pkgVersion = '1.1.0';
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                pkgVersion = pkg.version || '1.1.0';
            } catch (e) {
                console.warn('⚠️ [LiveUpdateDetector] Could not read package.json version.');
            }

            // 2. Get Current Version from DB
            let currentVersion = config.liveUpdate?.version || pkgVersion;
            
            // Cleanup currentVersion if it has more than 3 parts (legacy format)
            let versionParts = currentVersion.split('.');
            if (versionParts.length > 3) {
                versionParts = versionParts.slice(0, 3);
                currentVersion = versionParts.join('.');
            }

            // 3. Determine New Version
            const pkgParts = pkgVersion.split('.').map(Number);
            const dbParts = currentVersion.split('.').map(Number);

            let newVersion = '';
            
            // If the increment is due ONLY to needsSync and file hasn't changed, KEEP current version
            if (!isNewFile && needsSync) {
                newVersion = currentVersion;
                console.log(`ℹ️ [LiveUpdateDetector] Only syncing platforms to current version: ${newVersion}`);
            } else {
                // If package.json version is higher (major or minor), reset to package.json version
                if (pkgParts[0] > dbParts[0] || (pkgParts[0] === dbParts[0] && pkgParts[1] > dbParts[1])) {
                    newVersion = pkgVersion;
                } else {
                    // Otherwise increment the patch number
                    const patch = dbParts[2] || 0;
                    newVersion = `${dbParts[0]}.${dbParts[1]}.${patch + 1}`;
                }
                console.log(`🔄 [LiveUpdateDetector] Incrementing version: ${currentVersion} -> ${newVersion}`);
            }

            // 4. Update and Sync Platforms
            config.liveUpdate = {
                ...config.liveUpdate,
                version: newVersion,
                enabled: true,
                zipUrl: 'https://knoozbook.com/bundle.zip',
                lastZipMtime: currentMtime
            };

            // Android and iOS follow the Website version
            config.android.version = newVersion;
            config.ios.version = newVersion;

            // CRITICAL: DO NOT increment minBuildNumber automatically. 
            // That would force a native APK update every time a bundle.zip is updated!
            // minBuildNumber should only be changed manually by the admin in the dashboard.
            
            await config.save();
            console.log(`✅ [LiveUpdateDetector] All platforms synchronized to version: ${newVersion}`);
        } else {
            console.log(`ℹ [LiveUpdateDetector] System already up to date.`);
        }
    } catch (error) {
        // Detailed logging but don't let it crash the process
        console.error('❌ [LiveUpdateDetector] Error synchronizing versions:', error.message);
    }
}

module.exports = { detectAndUpdateLiveVersion };
