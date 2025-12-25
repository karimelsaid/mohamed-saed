const fs = require('fs');

async function fetchMapping() {
    const mapping = {};
    console.log('Starting to fetch line mapping for 604 pages using native fetch...');

    for (let page = 1; page <= 604; page++) {
        try {
            console.log(`Fetching page ${page}...`);
            const response = await fetch(`https://api.quran.com/api/v4/verses/by_page/${page}?words=true&fields=line_number&mushaf=1`);

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            if (data.verses.length === 0) {
                console.warn(`No verses found for page ${page}`);
                mapping[page] = Array(15).fill(0);
                continue;
            }

            const pageLines = Array.from({ length: 15 }, () => []);

            data.verses.forEach(verse => {
                verse.words.forEach(word => {
                    const lineIdx = word.line_number - 1;
                    if (lineIdx >= 0 && word.page_number === page) {
                        const targetLine = Math.min(lineIdx, 14); // Force into 1-15 range
                        pageLines[targetLine].push({
                            text: word.code_v1 || word.text || '',
                            verse_key: verse.verse_key
                        });
                    }
                });
            });

            mapping[page] = pageLines;

            // Small delay
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
            console.error(`Error fetching page ${page}:`, error.message);
            // Simple retry logic
            page--;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Ensure the directory exists
    if (!fs.existsSync('public/mushaf-data')) {
        fs.mkdirSync('public/mushaf-data', { recursive: true });
    }

    fs.writeFileSync('public/mushaf-data/line_word_counts.json', JSON.stringify(mapping, null, 2));
    console.log('Finished! Mapping saved to public/mushaf-data/line_word_counts.json');
}

fetchMapping();
