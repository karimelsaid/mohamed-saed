const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, 'quranic-data', 'quran-simple.txt');
const OUTPUT_PATH = path.join(__dirname, 'uploads', 'mushaf_assets', 'data', 'quran-search.json');

/**
 * Arabic Normalization Logic
 */
function normalizeArabic(text) {
    if (!text) return '';
    return text
        .replace(/[\u064B-\u065F]/g, '') // Remove Tashkeel
        .replace(/[أإآ]/g, 'ا')        // Unify Alef
        .replace(/ة/g, 'ه')            // Unify Marboota (Optional, depend on preference, usually good for search)
        .replace(/ى/g, 'ي')            // Unify Yaa
        .trim();
}

function generate() {
    console.log('--- Generating Search Data ---');

    if (!fs.existsSync(INPUT_PATH)) {
        console.error('Input file not found:', INPUT_PATH);
        return;
    }

    const content = fs.readFileSync(INPUT_PATH, 'utf8');
    const lines = content.split('\n');
    const results = [];

    lines.forEach(line => {
        if (!line.trim()) return;
        const parts = line.split('|');
        if (parts.length < 3) return;

        const surah = parts[0];
        const ayah = parts[1];
        const text = parts[2];

        results.push({
            k: `${surah}:${ayah}`, // Key (reduced size)
            t: text,               // Text (with tashkeel for display results)
            s: normalizeArabic(text) // Search (normalized)
        });
    });

    // Ensure directory exists
    const dir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results));
    console.log('Saved search data to:', OUTPUT_PATH);
    console.log('Total verses:', results.length);
    console.log('File size approx:', (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2), 'MB');
}

generate();
