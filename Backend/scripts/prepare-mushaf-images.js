/**
 * prepare-mushaf-images.js
 * 
 * Downloads 604 page images for warsh + tajweed from GitHub,
 * compresses them into ZIP archives (20 pages per zip = 31 zips per mushaf),
 * then uploads them to the VPS server.
 * 
 * Usage:
 *   node Backend/scripts/prepare-mushaf-images.js [mushaf] [--upload]
 * 
 * Examples:
 *   node Backend/scripts/prepare-mushaf-images.js warsh --upload
 *   node Backend/scripts/prepare-mushaf-images.js tajweed --upload
 *   node Backend/scripts/prepare-mushaf-images.js all --upload
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

// ── Config ──────────────────────────────────────────────────────────────────
const PAGES_PER_ZIP = 20;
const TOTAL_PAGES   = 604;
const CONCURRENT_DOWNLOADS = 5;  // parallel downloads per batch
const RETRY_ATTEMPTS = 4;
const RETRY_DELAY_MS = 1500;

const VPS_USER = 'root';
const VPS_HOST = '162.35.163.242';
const VPS_BASE_PATH = '/var/www/kenouz/uploads/mushaf_assets';

const SOURCES = {
    warsh:   (p) => `https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/kfgqpc/warsh/${p}.jpg`,
    tajweed: (p) => `https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/easyquran.com/hafs-tajweed/${p}.jpg`,
};

const OUTPUT_DIR = path.join(__dirname, '../uploads/mushaf_assets');
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const mushafArg = args[0] || 'all';
const doUpload = args.includes('--upload');

const mushafsToProcess = mushafArg === 'all' ? ['warsh', 'tajweed'] : [mushafArg];

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function downloadBuffer(url, attempt = 1) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const req = proto.get(url, { timeout: 30000 }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return downloadBuffer(res.headers.location, attempt).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
        req.on('error', reject);
    });
}

async function downloadWithRetry(url) {
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            return await downloadBuffer(url);
        } catch (err) {
            if (attempt < RETRY_ATTEMPTS) {
                const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                console.warn(`  ⚠ Retry ${attempt}/${RETRY_ATTEMPTS - 1} for ${url} (${err.message})`);
                await sleep(delay);
            } else {
                throw err;
            }
        }
    }
}

async function downloadBatch(urls) {
    const results = [];
    for (let i = 0; i < urls.length; i += CONCURRENT_DOWNLOADS) {
        const batch = urls.slice(i, i + CONCURRENT_DOWNLOADS);
        const batchResults = await Promise.allSettled(
            batch.map(({ url, page }) =>
                downloadWithRetry(url).then(buf => ({ page, buf }))
            )
        );
        for (const r of batchResults) {
            if (r.status === 'fulfilled') {
                results.push(r.value);
            } else {
                console.error(`  ✗ Failed permanently:`, r.reason.message);
                results.push(null); // skip this page
            }
        }
        // Avoid GitHub rate limiting between batches
        await sleep(300);
    }
    return results;
}

function zipName(groupIndex) {
    const start = groupIndex * PAGES_PER_ZIP + 1;
    const end   = Math.min(start + PAGES_PER_ZIP - 1, TOTAL_PAGES);
    return `pages_${String(start).padStart(3, '0')}_${String(end).padStart(3, '0')}.zip`;
}

async function processMushafs() {
    // Dynamically load JSZip
    let JSZip;
    try {
        JSZip = require('jszip');
    } catch {
        console.error('JSZip not found. Run: npm install jszip');
        process.exit(1);
    }

    for (const mushafId of mushafsToProcess) {
        const sourceUrl = SOURCES[mushafId];
        if (!sourceUrl) {
            console.error(`Unknown mushaf: ${mushafId}`);
            continue;
        }

        const mushafOutputDir = path.join(OUTPUT_DIR, mushafId, 'images');
        fs.mkdirSync(mushafOutputDir, { recursive: true });

        const totalGroups = Math.ceil(TOTAL_PAGES / PAGES_PER_ZIP);
        console.log(`\n🕌 Processing ${mushafId} (${TOTAL_PAGES} pages → ${totalGroups} ZIP files)`);
        console.log(`📁 Output: ${mushafOutputDir}\n`);

        for (let g = 0; g < totalGroups; g++) {
            const startPage = g * PAGES_PER_ZIP + 1;
            const endPage   = Math.min(startPage + PAGES_PER_ZIP - 1, TOTAL_PAGES);
            const zName     = zipName(g);
            const zipPath   = path.join(mushafOutputDir, zName);

            // Skip if already exists
            if (fs.existsSync(zipPath)) {
                console.log(`  ✓ Already exists: ${zName} — skipping`);
                continue;
            }

            console.log(`  📦 Creating ${zName} (pages ${startPage}–${endPage})`);

            // Prepare download list
            const urls = [];
            for (let p = startPage; p <= endPage; p++) {
                urls.push({ url: sourceUrl(p), page: p });
            }

            // Download all pages in this group
            const results = await downloadBatch(urls);

            // Build ZIP
            const zip = new JSZip();
            let added = 0;
            for (const result of results) {
                if (result && result.buf) {
                    zip.file(`${result.page}.jpg`, result.buf);
                    added++;
                }
            }

            if (added === 0) {
                console.warn(`  ⚠ No pages downloaded for ${zName} — skipping`);
                continue;
            }

            // Write ZIP file
            const zipBuffer = await zip.generateAsync({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 } // balanced speed/size (JPEGs barely compress)
            });
            fs.writeFileSync(zipPath, zipBuffer);

            const sizeMB = (zipBuffer.length / 1024 / 1024).toFixed(2);
            console.log(`  ✅ ${zName} — ${added}/${endPage - startPage + 1} pages, ${sizeMB} MB`);
        }

        console.log(`\n✅ Done processing ${mushafId}!`);

        if (doUpload) {
            await uploadToVPS(mushafId, mushafOutputDir);
        }
    }

    if (!doUpload) {
        console.log('\n💡 To upload to VPS, run with --upload flag');
        console.log(`   node Backend/scripts/prepare-mushaf-images.js ${mushafArg} --upload`);
    }
}

async function uploadToVPS(mushafId, localDir) {
    const remotePath = `${VPS_USER}@${VPS_HOST}:${VPS_BASE_PATH}/${mushafId}/images/`;
    console.log(`\n📤 Uploading ${mushafId} ZIPs to VPS...`);
    console.log(`   From: ${localDir}`);
    console.log(`   To:   ${remotePath}\n`);

    // Create remote directory first
    const mkdirCmd = `ssh ${VPS_USER}@${VPS_HOST} "mkdir -p ${VPS_BASE_PATH}/${mushafId}/images"`;
    try {
        execSync(mkdirCmd, { stdio: 'inherit' });
    } catch (e) {
        console.warn('Could not create remote directory (may already exist)');
    }

    // Upload with rsync for reliability (skip existing files with same size)
    const rsyncCmd = `rsync -avz --progress "${localDir}/" "${remotePath}"`;
    console.log(`Running: ${rsyncCmd}\n`);
    try {
        execSync(rsyncCmd, { stdio: 'inherit' });
        console.log(`\n✅ Upload complete for ${mushafId}!`);
    } catch (e) {
        console.error(`✗ Upload failed:`, e.message);
        console.log('\nAlternatively, use scp manually:');
        console.log(`  scp -r "${localDir}" "${remotePath}"`);
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────
processMushafs().catch(err => {
    console.error('\n💥 Fatal error:', err.message);
    process.exit(1);
});
