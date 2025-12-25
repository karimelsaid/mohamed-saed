const fs = require('fs');

/**
 * Maps words sequentially to glyphs, taking into account the gap in fonts.
 * Also handles ASCII mirroring swap for RTL rendering (parentheses etc).
 */
function getSmartMappedChar(wordIndexInPage) {
    let code = 33 + wordIndexInPage;
    if (code > 126) {
        code += 34; // Skip the hole (126 -> 161)
    }

    // Arabic RTL Mirroring Fix:
    if (code === 40) return String.fromCharCode(41); // ( -> )
    if (code === 41) return String.fromCharCode(40); // ) -> (
    if (code === 91) return String.fromCharCode(93); // [ -> ]
    if (code === 93) return String.fromCharCode(91); // ] -> [
    if (code === 123) return String.fromCharCode(125); // { -> }
    if (code === 125) return String.fromCharCode(123); // } -> {
    if (code === 60) return String.fromCharCode(62); // < -> >
    if (code === 62) return String.fromCharCode(60); // > -> <

    return String.fromCharCode(code);
}

function convert() {
    console.log('Starting Robust Layout conversion (Multi-Surah, Centered P1/P2)...');
    const mapping = JSON.parse(fs.readFileSync('public/mushaf-data/line_word_counts.json', 'utf8'));
    const surahInfo = JSON.parse(fs.readFileSync('public/mushaf-data/surah_info.json', 'utf8'));

    const result = [];

    // Map of all surahs starting on each page
    const surahsByPage = {};
    surahInfo.forEach(s => {
        if (!surahsByPage[s.start_page]) surahsByPage[s.start_page] = [];
        surahsByPage[s.start_page].push(s);
    });

    for (let pageNum = 1; pageNum <= 604; pageNum++) {
        const pageMapping = mapping[pageNum.toString()] || Array(15).fill(0);
        const surahsOnPage = surahsByPage[pageNum] || [];

        const pageLines = [];
        let wordPointer = 0;
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

        result.push({ page_number: pageNum, lines: pageLines });
    }

    fs.writeFileSync('src/assets/data/mushaf.json', JSON.stringify(result, null, 2));
    console.log('Successfully completed Robust conversion in src/assets/data/mushaf.json');
}

convert();
