const fs = require('fs');
const path = require('path');

// Changed input path to the one the user likely set up or the original if that fails.
// User moved it to public/mushaf-data/mushaf.txt
const inputFile = 'd:\\My projects\\Kenouz\\public\\mushaf-data\\mushaf.txt';
// Fallback if needed, but let's try the user's location first.
const outputFile = 'd:\\My projects\\Kenouz\\src\\assets\\data\\mushaf.json';

try {
    if (!fs.existsSync(inputFile)) {
        console.error('Input file not found:', inputFile);
        process.exit(1);
    }

    const data = fs.readFileSync(inputFile, 'utf8');
    const lines = data.split(/\r?\n/);
    const pages = [];

    lines.forEach(line => {
        if (!line.trim()) return;

        // Format expectations based on user provided snippet:
        // 1,ﱁ ﱂ ﱃ ﱄ ﱅ
        const parts = line.split(',');
        if (parts.length < 2) return;

        const pageNum = parseInt(parts[0].trim());
        const text = parts.slice(1).join(',').trim();

        // Find existing page or create new
        let pageObj = pages.find(p => p.page_number === pageNum);
        if (!pageObj) {
            pageObj = {
                page_number: pageNum,
                lines: []
            };
            pages.push(pageObj);
        }
        pageObj.lines.push(text);
    });

    // Sort valid pages
    pages.sort((a, b) => a.page_number - b.page_number);

    fs.writeFileSync(outputFile, JSON.stringify(pages, null, 2), 'utf8');
    console.log(`Successfully converted ${pages.length} pages to ${outputFile}`);

} catch (err) {
    console.error('Error processing file:', err);
}
