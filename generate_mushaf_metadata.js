const fs = require('fs');
const https = require('https');

async function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function generate() {
    console.log('Fetching metadata from api.quran.com...');

    try {
        // 1. Fetch Surahs (Chapters)
        const chaptersData = await fetchJson('https://api.quran.com/api/v4/chapters');
        const surahs = chaptersData.chapters.map(c => ({
            id: c.id,
            name: c.name_arabic,
            start_page: c.pages[0],
            end_page: c.pages[1]
        }));

        // 2. Fetch Juzs (30)
        const juzsData = await fetchJson('https://api.quran.com/api/v4/juzs');
        const juzsWithPages = [];
        const seenJuz = new Set();

        for (const j of juzsData.juzs) {
            if (seenJuz.has(j.juz_number)) continue;
            seenJuz.add(j.juz_number);

            const firstSurah = Object.keys(j.verse_mapping)[0];
            const firstVerseRange = j.verse_mapping[firstSurah];
            const firstVerse = firstVerseRange.split('-')[0];

            const verseInfo = await fetchJson(`https://api.quran.com/api/v4/verses/by_key/${firstSurah}:${firstVerse}`);
            juzsWithPages.push({
                id: j.juz_number,
                start_page: verseInfo.verse.page_number
            });
            console.log(`Juz ${j.juz_number} starts on page ${verseInfo.verse.page_number}`);
        }

        // 3. Fetch Hizbs (60)
        const hizbsWithPages = [];
        for (let h = 1; h <= 60; h++) {
            const verseInfo = await fetchJson(`https://api.quran.com/api/v4/verses/by_hizb/${h}?per_page=1`);
            hizbsWithPages.push({
                id: h,
                start_page: verseInfo.verses[0].page_number
            });
            console.log(`Hizb ${h} starts on page ${verseInfo.verses[0].page_number}`);
        }

        const output = {
            surahs,
            juzs: juzsWithPages.sort((a, b) => a.id - b.id),
            hizbs: hizbsWithPages
        };

        fs.writeFileSync('src/assets/data/mushaf-metadata.json', JSON.stringify(output, null, 2));
        console.log('Successfully saved to src/assets/data/mushaf-metadata.json');

    } catch (err) {
        console.error('Error generating metadata:', err);
    }
}

generate();
