const quranUtils = require('./utils/quranUtils');

console.log('--- QuranUtils Verification ---');

// Test 1: Page for Fatiha 1
const p1 = quranUtils.getPageForVerse(1, 1);
console.log(`Fatiha 1: Page ${p1} (Expected: 1)`);

// Test 2: Last verse of Page 1
const lastP1 = quranUtils.getLastVerseOfPage(1);
console.log(`Last of Page 1: Surah ${lastP1.surah}, Verse ${lastP1.verse} (Expected: 1, 7)`);

// Test 3: Half page target for Baqarah 1 (Page 2)
// Split for Page 2 is 2:5 (as seen in search earlier)
const halfP2 = quranUtils.getHalfPageTarget(2, 1);
console.log(`Half Page target for Baqarah 1 (Page 2): Surah ${halfP2.surah}, Verse ${halfP2.verse} (Expected: 2, 5)`);

// Test 4: Half page target for Baqarah 6 (Page 2)
const halfP2_second = quranUtils.getHalfPageTarget(2, 6);
console.log(`Half Page target for Baqarah 6 (Page 2): Surah ${halfP2_second.surah}, Verse ${halfP2_second.verse} (Expected: 2, 16 - end of page 2)`);

// Test 5: Page 106 transition
const lastP106 = quranUtils.getLastVerseOfPage(106);
console.log(`Last of Page 106: Surah ${lastP106.surah}, Verse ${lastP106.verse}`);

// Test 6: Verse count for Page 5 (2:25 to 2:29)
const countP5 = quranUtils.getVerseCountInRange(2, 25, 2, 29);
console.log(`Verse count for Page 5 (2:25-29): ${countP5} (Expected: 5)`);

// Test 7: Verse count from 2:26 to 2:29
const countP5_remain = quranUtils.getVerseCountInRange(2, 26, 2, 29);
console.log(`Verse count for Page 5 remainder (2:26-29): ${countP5_remain} (Expected: 4)`);

// Test 8: Verse count across surahs (Fatiha 1 to Baqarah 5)
const countCross = quranUtils.getVerseCountInRange(1, 1, 2, 5);
console.log(`Verse count from 1:1 to 2:5: ${countCross} (Expected: 7 + 5 = 12)`);

console.log('Verification Complete.');
