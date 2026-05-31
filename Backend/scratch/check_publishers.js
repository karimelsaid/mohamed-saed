const fs = require('fs');
const path = require('path');

const normalizeArabic = (str) => {
  if (!str) return '';
  return str
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // Remove diacritics
    .trim()
    .toLowerCase();
};

try {
  const outputJsonPath = path.join(__dirname, '../output.json');
  if (fs.existsSync(outputJsonPath)) {
    const excelData = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
    console.log('Total books in output.json:', excelData.length);
    const publishers = excelData.map(b => b.publisher).filter(p => p && p.trim());
    const uniquePublishers = [...new Set(publishers)];
    console.log('Unique publishers in output.json:', uniquePublishers);
    console.log('Normalized unique publishers:', uniquePublishers.map(normalizeArabic));
  } else {
    console.log('output.json does not exist!');
  }
} catch (e) {
  console.error(e);
}
