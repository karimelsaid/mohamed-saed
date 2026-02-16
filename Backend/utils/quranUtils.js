const fs = require('fs');
const path = require('path');
const { surahVerses } = require('./surahData');

const METADATA_PATH = path.join(__dirname, '../uploads/mushaf_assets/data/mushaf-metadata.json');
const SPLIT_PATH = path.join(__dirname, '../uploads/mushaf_assets/data/mushaf_chunks/split.json');
const JUZ_CHUNKS_DIR = path.join(__dirname, '../uploads/mushaf_assets/data/mushaf_chunks');

let metadata = null;
let splitData = null;
let verseToPageMap = new Map(); // "surah:verse" -> page
let pageToLastVerseMap = new Map(); // page -> {surah, verse}
let pageToFirstVerseMap = new Map(); // page -> {surah, verse}
let globalPageVersesSetMap = new Map(); // page -> Set<verseKey>

const getTodayEgyptStr = () => {
    const now = new Date();
    const egyptOffset = 2 * 60; // UTC+2
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const egyptTime = new Date(utc + (egyptOffset * 60000));
    return egyptTime.toISOString().split('T')[0];
};

function loadData() {
    try {
        if (fs.existsSync(METADATA_PATH)) {
            metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
        }
        if (fs.existsSync(SPLIT_PATH)) {
            splitData = JSON.parse(fs.readFileSync(SPLIT_PATH, 'utf8'));
        }

        // Load all juz files to build a comprehensive map
        for (let i = 1; i <= 30; i++) {
            const juzPath = path.join(JUZ_CHUNKS_DIR, `juz_${i}.json`);
            if (fs.existsSync(juzPath)) {
                const juzData = JSON.parse(fs.readFileSync(juzPath, 'utf8'));
                juzData.forEach(page => {
                    const pageNum = page.page_number;

                    // Get or create the global Set for this page to deduplicate across chunks
                    if (!globalPageVersesSetMap.has(pageNum)) {
                        globalPageVersesSetMap.set(pageNum, new Set());
                    }
                    const globalSet = globalPageVersesSetMap.get(pageNum);

                    page.lines.forEach(line => {
                        if (line.segments) {
                            line.segments.forEach(seg => {
                                const vKey = seg.verse_key; // "surah:verse"
                                if (vKey) {
                                    globalSet.add(vKey);
                                    verseToPageMap.set(vKey, pageNum);
                                    const [s, v] = vKey.split(':').map(Number);
                                    if (!pageToFirstVerseMap.has(pageNum)) {
                                        pageToFirstVerseMap.set(pageNum, { surah: s, verse: v });
                                    }
                                    pageToLastVerseMap.set(pageNum, { surah: s, verse: v });
                                }
                            });
                        }
                    });
                });
            }
        }
    } catch (err) {
        console.error('[QuranUtils] Error loading data:', err);
    }
}

loadData();

module.exports = {
    getTodayEgyptStr,
    getPageForVerse: (surah, verse) => {
        return verseToPageMap.get(`${surah}:${verse}`);
    },
    getVersesCountOnPage: (pageNum) => {
        const set = globalPageVersesSetMap.get(pageNum);
        return set ? set.size : 0;
    },
    getLastVerseOfPage: (pageNum) => {
        return pageToLastVerseMap.get(pageNum);
    },
    getFirstVerseOfPage: (pageNum) => {
        return pageToFirstVerseMap.get(pageNum);
    },
    getHalfPageTarget: (surah, verse) => {
        const page = verseToPageMap.get(`${surah}:${verse}`);
        if (!page) return null;

        const split = splitData ? splitData.find(s => s.page === page) : null;
        if (!split) return pageToLastVerseMap.get(page); // Fallback to end of page

        const target = split.split; // {surah, ayah}
        // If current verse is already AFTER the split, the target is the end of the page.
        // If current verse is AT or BEFORE the split, the target is the split.

        if (surah > target.surah || (surah === target.surah && verse > target.ayah)) {
            return pageToLastVerseMap.get(page);
        } else {
            return { surah: target.surah, verse: target.ayah };
        }
    },
    isEndOfPage: (surah, verse) => {
        const page = verseToPageMap.get(`${surah}:${verse}`);
        if (!page) return false;
        const last = pageToLastVerseMap.get(page);
        return surah === last.surah && verse === last.verse;
    },
    isStartOfPage: (surah, verse) => {
        const page = verseToPageMap.get(`${surah}:${verse}`);
        if (!page) return false;
        const first = pageToFirstVerseMap.get(page);
        return surah === first.surah && verse === first.verse;
    },
    isStartOfHalfPage: (surah, verse) => {
        const page = verseToPageMap.get(`${surah}:${verse}`);
        if (!page) return false;

        // Either first verse of page
        const first = pageToFirstVerseMap.get(page);
        if (surah === first.surah && verse === first.verse) return true;

        // Or first verse of second half
        const split = splitData ? splitData.find(s => s.page === page) : null;
        if (split && split.split) {
            // The split target is the LAST ayah of first half. 
            // So start of second half is the one IMMEDIATELY after it.
            let nextSurah = split.split.surah;
            let nextVerse = split.split.ayah + 1;
            const total = surahVerses[nextSurah] || 286;
            if (nextVerse > total) {
                nextSurah++;
                nextVerse = 1;
            }
            return surah === nextSurah && verse === nextVerse;
        }
        return false;
    },
    getHalfPageStart: (surah, verse) => {
        const page = verseToPageMap.get(`${surah}:${verse}`);
        if (!page) return { surah, verse };

        const first = pageToFirstVerseMap.get(page);
        const split = splitData ? splitData.find(s => s.page === page) : null;

        if (!split || !split.split) return first;

        // Is our verse in the second half?
        if (surah > split.split.surah || (surah === split.split.surah && verse > split.split.ayah)) {
            // Yes, second half start is after split
            let nextSurah = split.split.surah;
            let nextVerse = split.split.ayah + 1;
            const total = surahVerses[nextSurah] || 286;
            if (nextVerse > total) {
                nextSurah++;
                nextVerse = 1;
            }
            return { surah: nextSurah, verse: nextVerse };
        } else {
            // First half start is page start
            return first;
        }
    },
    getVerseCountInRange: (startSurah, startVerse, endSurah, endVerse) => {
        let count = 0;
        let s = startSurah;
        let v = startVerse;

        while (s < endSurah || (s === endSurah && v <= endVerse)) {
            count++;
            const total = surahVerses[s] || 7;
            v++;
            if (v > total) {
                s++;
                v = 1;
            }
            if (s > 114) break;
        }
        return count;
    },
    getVersesKeysInRange: (startSurah, startVerse, amount, capTarget = null) => {
        const verses = [];
        let currentSurah = startSurah;
        let currentVerse = startVerse;
        let count = 0;

        while (count < amount) {
            if (currentSurah > 114) break;
            const total = surahVerses[currentSurah] || 7;

            while (currentVerse <= total && count < amount) {
                if (capTarget && (currentSurah > capTarget.surah || (currentSurah === capTarget.surah && currentVerse > capTarget.verse))) {
                    break;
                }
                verses.push(`${currentSurah}:${currentVerse}`);
                currentVerse++;
                count++;
            }

            if (currentVerse > total) {
                currentSurah++;
                currentVerse = 1;
            }
            if (capTarget && currentSurah > capTarget.surah) break;
        }
        return verses;
    },
    getSurahVerses: (surah) => {
        return surahVerses[surah] || 0;
    },
    getJuzForPage: (pageNum) => {
        if (!metadata || !metadata.juzs) return 1;
        let juzId = 1;
        for (const juz of metadata.juzs) {
            if (pageNum >= juz.start_page) {
                juzId = juz.id;
            } else {
                break;
            }
        }
        return juzId;
    },
    getSurahAndJuzLabel: (pageNum) => {
        if (!metadata) return `صفحة ${pageNum}`;

        // Find Surah(s) on this page
        const surahs = metadata.surahs.filter(s => pageNum >= s.start_page && pageNum <= s.end_page);
        const juzId = module.exports.getJuzForPage(pageNum);

        const surahNames = surahs.map(s => s.name).join(' و');
        return `الجزء ${juzId} - صفحة ${pageNum} (${surahNames})`;
    },
    getPagesCountInJuz: (juzId) => {
        if (!metadata || !metadata.juzs) return 20;
        const juz = metadata.juzs.find(j => j.id === juzId);
        if (!juz) return 20;

        const nextJuz = metadata.juzs.find(j => j.id === juzId + 1);
        if (nextJuz) {
            return nextJuz.start_page - juz.start_page;
        }
        // Juz 30 ends at 604
        return 604 - juz.start_page + 1;
    }
};
