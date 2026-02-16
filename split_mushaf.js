const fs = require('fs');
const path = require('path');

const mushafPath = 'src/assets/data/mushaf.json';
const metadataPath = 'src/assets/data/mushaf-metadata.json';
const outputDir = 'src/assets/data/mushaf_chunks';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const mushaf = JSON.parse(fs.readFileSync(mushafPath, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

const juzs = metadata.juzs;

for (let i = 0; i < juzs.length; i++) {
    const juz = juzs[i];
    const startPage = juz.start_page;
    const endPage = (i + 1 < juzs.length) ? juzs[i + 1].start_page - 1 : 604;

    const chunk = mushaf.filter(p => p.page_number >= startPage && p.page_number <= endPage);

    fs.writeFileSync(
        path.join(outputDir, `juz_${juz.id}.json`),
        JSON.stringify(chunk)
    );
    console.log(`Created juz_${juz.id}.json (Pages ${startPage}-${endPage})`);
}
