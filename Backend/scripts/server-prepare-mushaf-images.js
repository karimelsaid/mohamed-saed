#!/usr/bin/env node
/**
 * server-prepare-mushaf-images.js
 *
 * يُشغَّل مباشرةً على السيرفر VPS.
 * يحمّل صور صفحات المصاحف من GitHub ويضغطها في ملفات ZIP
 * (20 صفحة لكل ZIP = 31 ملف لكل مصحف).
 *
 * الاستخدام على السيرفر:
 *   cd /var/www/kenouz
 *   node Backend/scripts/server-prepare-mushaf-images.js warsh
 *   node Backend/scripts/server-prepare-mushaf-images.js tajweed
 *   node Backend/scripts/server-prepare-mushaf-images.js all
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const PAGES_PER_ZIP        = 20;
const TOTAL_PAGES          = 604;
const CONCURRENT_DOWNLOADS = 8;
const RETRY_ATTEMPTS       = 5;
const RETRY_DELAY_MS       = 2000;

// مسار الرفع على السيرفر
const OUTPUT_BASE = path.join(__dirname, '../../uploads/mushaf_assets');

const SOURCES = {
    warsh:   (p) => `https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/kfgqpc/warsh/${p}.jpg`,
    tajweed: (p) => `https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/easyquran.com/hafs-tajweed/${p}.jpg`,
};
// ─────────────────────────────────────────────────────────────────────────────

const args        = process.argv.slice(2);
const mushafArg   = args[0] || 'all';
const mushafs     = mushafArg === 'all' ? ['warsh', 'tajweed'] : [mushafArg];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const req = proto.get(url, { timeout: 30000 }, (res) => {
            if ([301,302,307].includes(res.statusCode))
                return downloadBuffer(res.headers.location).then(resolve).catch(reject);
            if (res.statusCode !== 200)
                return reject(new Error(`HTTP ${res.statusCode}`));
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end',  () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', reject);
    });
}

async function downloadWithRetry(url, label) {
    for (let i = 1; i <= RETRY_ATTEMPTS; i++) {
        try { return await downloadBuffer(url); }
        catch (e) {
            if (i < RETRY_ATTEMPTS) {
                process.stdout.write(`    ⚠ retry ${i} for ${label}: ${e.message}\n`);
                await sleep(RETRY_DELAY_MS * Math.pow(2, i - 1));
            } else throw e;
        }
    }
}

async function downloadBatch(items) {
    const results = new Array(items.length).fill(null);
    for (let i = 0; i < items.length; i += CONCURRENT_DOWNLOADS) {
        const slice = items.slice(i, i + CONCURRENT_DOWNLOADS);
        const settled = await Promise.allSettled(
            slice.map(({ url, page }, idx) =>
                downloadWithRetry(url, `page ${page}`)
                    .then(buf => ({ idx: i + idx, page, buf }))
            )
        );
        for (const r of settled) {
            if (r.status === 'fulfilled') {
                results[r.value.idx] = r.value;
            } else {
                const failedPage = slice[settled.indexOf(r)]?.page;
                process.stderr.write(`    ✗ FAILED page ${failedPage}: ${r.reason?.message}\n`);
            }
        }
        await sleep(300); // avoid rate limiting
    }
    return results.filter(Boolean);
}

function zipName(startPage, endPage) {
    return `pages_${String(startPage).padStart(3,'0')}_${String(endPage).padStart(3,'0')}.zip`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
    // Load JSZip (install once on server with: npm install jszip)
    let JSZip;
    try { JSZip = require('jszip'); }
    catch {
        console.error('\n❌  JSZip not found. Run first:\n    npm install jszip\n');
        process.exit(1);
    }

    for (const mushafId of mushafs) {
        const srcFn  = SOURCES[mushafId];
        if (!srcFn) { console.error(`Unknown mushaf: ${mushafId}`); continue; }

        const outDir = path.join(OUTPUT_BASE, mushafId, 'images');
        fs.mkdirSync(outDir, { recursive: true });

        const totalGroups = Math.ceil(TOTAL_PAGES / PAGES_PER_ZIP);
        console.log(`\n🕌  ${mushafId.toUpperCase()} — ${TOTAL_PAGES} pages → ${totalGroups} ZIP files`);
        console.log(`📁  ${outDir}\n`);

        let totalSizeMB = 0;

        for (let g = 0; g < totalGroups; g++) {
            const start = g * PAGES_PER_ZIP + 1;
            const end   = Math.min(start + PAGES_PER_ZIP - 1, TOTAL_PAGES);
            const name  = zipName(start, end);
            const dest  = path.join(outDir, name);

            if (fs.existsSync(dest)) {
                const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(2);
                console.log(`  ✓ Already exists: ${name} (${mb} MB) — skipping`);
                totalSizeMB += parseFloat(mb);
                continue;
            }

            process.stdout.write(`  📦 ${name} (pages ${start}–${end}) ... `);

            // Download all pages in this group
            const items = [];
            for (let p = start; p <= end; p++) items.push({ url: srcFn(p), page: p });
            const downloaded = await downloadBatch(items);

            // Build ZIP
            const zip = new JSZip();
            for (const { page, buf } of downloaded) zip.file(`${page}.jpg`, buf);

            const zipBuf = await zip.generateAsync({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }  // balanced — JPEGs barely compress
            });

            fs.writeFileSync(dest, zipBuf);
            const mb = (zipBuf.length / 1024 / 1024).toFixed(2);
            totalSizeMB += parseFloat(mb);
            process.stdout.write(`✅  ${downloaded.length}/${end-start+1} pages, ${mb} MB\n`);
        }

        console.log(`\n✅  ${mushafId} done! Total: ~${totalSizeMB.toFixed(1)} MB in ${outDir}`);
    }

    console.log('\n🎉  All done! The ZIP files are ready to serve.\n');
}

run().catch(err => {
    console.error('\n💥  Fatal:', err.message);
    process.exit(1);
});
