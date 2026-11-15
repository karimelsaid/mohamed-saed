const fs = require('fs');
const path = require('path');

// Determine which mushaf to download. Default to hafs_v2 (mushaf=2)
const mushafId = process.argv[2] ? parseInt(process.argv[2], 10) : 2;
let folderName = 'hafs_v2';
if (mushafId === 1) folderName = 'hafs_v1';
else if (mushafId === 2) folderName = 'hafs_v2';
else if (mushafId === 11) folderName = 'tajweed';
else if (mushafId === 3) folderName = 'warsh';
else folderName = `mushaf_${mushafId}`;

console.log(`\n🚀 Starting download/build process for Mushaf ID: ${mushafId} (Folder: ${folderName})...\n`);

// Determine base uploads directory dynamically
let uploadsBase = '';
const pathsToTry = [
    path.join(__dirname, 'Backend', 'uploads'),
    path.join(__dirname, 'uploads')
];

for (const p of pathsToTry) {
    if (fs.existsSync(path.join(p, 'mushaf_assets', 'data', 'mushaf-metadata.json'))) {
        uploadsBase = p;
        break;
    }
}

if (!uploadsBase) {
    console.error(`❌ Critical error: Could not locate 'mushaf_assets/data/mushaf-metadata.json' in either 'Backend/uploads' or 'uploads'.`);
    console.error(`Please make sure the default mushaf assets folder exists in your uploads directory.`);
    process.exit(1);
}

console.log(`📂 Found uploads directory at: ${uploadsBase}`);

const baseDir = path.join(uploadsBase, 'mushaf_assets', folderName);
const dataDir = path.join(baseDir, 'data');
const chunksDir = path.join(dataDir, 'mushaf_chunks');
const fontsDir = path.join(baseDir, 'fonts');

// Ensure directories exist
fs.mkdirSync(chunksDir, { recursive: true });
fs.mkdirSync(fontsDir, { recursive: true });

// Helper to copy file
function copyFile(src, dest) {
    try {
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`   Copied local metadata template.`);
        }
    } catch (err) {
        console.error(`⚠️ Failed to copy local asset: ${err.message}`);
    }
}

// Copy mushaf-metadata.json from default assets
const srcMetadata = path.join(uploadsBase, 'mushaf_assets', 'data', 'mushaf-metadata.json');
const destMetadata = path.join(dataDir, 'mushaf-metadata.json');
copyFile(srcMetadata, destMetadata);

// Copy QCF_BSML.woff2 from default assets
const srcBsml = path.join(uploadsBase, 'mushaf_assets', 'fonts', 'QCF_BSML.woff2');
const destBsml = path.join(fontsDir, 'QCF_BSML.woff2');
copyFile(srcBsml, destBsml);

const metadata = JSON.parse(fs.readFileSync(destMetadata, 'utf8'));
const surahInfo = metadata.surahs;

const surahsByPage = {};
surahInfo.forEach(s => {
    if (!surahsByPage[s.start_page]) surahsByPage[s.start_page] = [];
    surahsByPage[s.start_page].push(s);
});

// Helper to pad page number to 3 digits (e.g. 1 -> 001)
function pad(num, size) {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
}

const allPagesResult = [];

async function start() {
    // 1. Download Fonts and Fetch Mappings page-by-page
    for (let page = 1; page <= 604; page++) {
        const paddedPage = pad(page, 3);
        console.log(`[Page ${page}/604] Processing...`);

        // A. Download Font File
        // CDN only has hafs/v1 and hafs/v2. Warsh and Tajweed use hafs/v2 font structure
        // with different word encodings (code_v2). hafs/v1 uses code_v1 encoding.
        const fontName = `QCF_P${paddedPage}.woff2`;
        const fontDest = path.join(fontsDir, fontName);

        let fontUrl;
        if (mushafId === 1) {
            fontUrl = `https://verses.quran.foundation/fonts/quran/hafs/v1/woff2/p${page}.woff2`;
        } else {
            // mushafId 2 (hafs_v2), 3 (warsh), 11 (tajweed) — all use hafs/v2 font
            fontUrl = `https://verses.quran.foundation/fonts/quran/hafs/v2/woff2/p${page}.woff2`;
        }

        try {
            const fontResponse = await fetch(fontUrl);
            if (!fontResponse.ok) {
                throw new Error(`HTTP status ${fontResponse.status}`);
            }
            const buffer = Buffer.from(await fontResponse.arrayBuffer());
            fs.writeFileSync(fontDest, buffer);
        } catch (err) {
            console.warn(`   ⚠️ Font failed (${err.message}). Retrying fallback to hafs/v2...`);
            try {
                const fallbackUrl = `https://verses.quran.foundation/fonts/quran/hafs/v2/woff2/p${page}.woff2`;
                const fontResponse = await fetch(fallbackUrl);
                const buffer = Buffer.from(await fontResponse.arrayBuffer());
                fs.writeFileSync(fontDest, buffer);
            } catch (fallbackErr) {
                console.error(`   ❌ Fallback font failed: ${fallbackErr.message}`);
            }
        }

        // B. Fetch Page Mappings — request code_v1/code_v2 for correct QCF font encoding
        const apiUrl = `https://api.quran.com/api/v4/verses/by_page/${page}?words=true&word_fields=code_v1,code_v2&fields=line_number&mushaf=${mushafId}`;
        let pageData = null;
        let attempts = 3;
        while (attempts > 0) {
            try {
                const res = await fetch(apiUrl);
                if (!res.ok) throw new Error(`HTTP status ${res.status}`);
                pageData = await res.json();
                break;
            } catch (err) {
                attempts--;
                if (attempts === 0) {
                    console.error(`   ❌ Failed API call: ${err.message}`);
                } else {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        if (!pageData) {
            pageData = { verses: [] };
        }

        // Parse verses into lines (1 to 15)
        const pageLines = [];
        const pageMapping = Array.from({ length: 15 }, () => []);

        pageData.verses.forEach(verse => {
            verse.words.forEach(word => {
                const lineIdx = word.line_number - 1;
                if (lineIdx >= 0 && word.page_number === page) {
                    const targetLine = Math.min(lineIdx, 14); // Force into 0-14 range
                    
                    // code_v1 = hafs v1 QCF encoding, code_v2 = hafs v2 / warsh / tajweed QCF encoding
                    let text = word.code_v2 || word.code_v1 || word.text || '';
                    if (mushafId === 1) text = word.code_v1 || word.text || '';

                    pageMapping[targetLine].push({
                        text: text,
                        verse_key: verse.verse_key
                    });
                }
            });
        });

        // Insert headers and bismillahs using the layout system
        const surahsOnPage = surahsByPage[page] || [];
        let surahIdx = 0;
        let skipNextEmpty = false;

        for (let i = 0; i < 15; i++) {
            let type = 'verse';
            let segments = [];
            let lineText = '';

            if (skipNextEmpty) {
                skipNextEmpty = false;
                continue;
            }

            const lineContent = pageMapping[i] || [];
            if (lineContent.length > 0) {
                segments = lineContent;
                type = 'verse';
            } else {
                if (surahIdx < surahsOnPage.length) {
                    const currentSurah = surahsOnPage[surahIdx];
                    type = 'header';
                    lineText = 'سورة ' + currentSurah.name;

                    if (currentSurah.id !== 9) {
                        pageLines.push({ line_number: pageLines.length + 1, type: 'header', text: lineText });
                        pageLines.push({ line_number: pageLines.length + 1, type: 'bismillah', text: '﷽' });

                        if (i + 1 < 15 && (pageMapping[i + 1] === 0 || pageMapping[i + 1].length === 0)) {
                            skipNextEmpty = true;
                        }
                        surahIdx++;
                        continue;
                    } else {
                        surahIdx++;
                    }
                } else {
                    type = 'header';
                    lineText = '';
                }
            }

            const lineObj = {
                line_number: pageLines.length + 1,
                type: type
            };

            if (type === 'verse') {
                lineObj.segments = segments;
            } else {
                lineObj.text = lineText;
            }

            pageLines.push(lineObj);
        }

        allPagesResult.push({ page_number: page, lines: pageLines });
        await new Promise(r => setTimeout(r, 80)); // be friendly to Quran.com API limits
    }

    // 2. Save full mushaf.json
    fs.writeFileSync(path.join(dataDir, 'mushaf.json'), JSON.stringify(allPagesResult, null, 2));
    console.log(`\n✅ Saved complete mushaf.json database.`);

    // 3. Split into 30 Juz chunks
    console.log(`\nSplitting mushaf.json into 30 Juz chunks...`);
    const juzs = metadata.juzs;
    juzs.forEach((juz, idx) => {
        const startPage = juz.start_page;
        const endPage = (idx < juzs.length - 1) ? (juzs[idx + 1].start_page - 1) : 604;
        const juzPages = allPagesResult.filter(p => p.page_number >= startPage && p.page_number <= endPage);

        fs.writeFileSync(
            path.join(chunksDir, `juz_${juz.id}.json`),
            JSON.stringify(juzPages, null, 2)
        );
        console.log(`- Juz ${juz.id} chunk created (Pages: ${startPage} - ${endPage}).`);
    });

    console.log(`\n🎉 SUCCESS! All assets generated and stored under: ${baseDir}\n`);
}

start().catch(err => {
    console.error(`Fatal error in download script:`, err);
});
