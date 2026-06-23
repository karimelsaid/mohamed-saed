const fs = require('fs');
const path = require('path');
const normalizeArabic = (text) => {
  if (!text) return '';
  return text.trim().replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
};

const outputJsonPath = path.join(__dirname, 'output.json');
let excelPublishers = [];
if (fs.existsSync(outputJsonPath)) {
  const excelData = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
  excelPublishers = excelData.map(b => b.publisher).filter(p => p && p.trim());
}

const normalizedActivePublishers = excelPublishers.map(p => normalizeArabic(p));

const publishersDir = path.join(__dirname, 'uploads', 'books', 'publishers');
console.log('publishersDir exists?', fs.existsSync(publishersDir));
let count = 0;
if (fs.existsSync(publishersDir)) {
  const files = fs.readdirSync(publishersDir);
  files.forEach(file => {
    if (file.endsWith('.webp') || file.endsWith('.png') || file.endsWith('.jpg')) {
      const rawPublisherName = file.replace(/\.(webp|png|jpg)$/, '').replace(/[_-]/g, ' ').trim();
      const normalizedFileName = normalizeArabic(rawPublisherName);
      const hasProducts = normalizedActivePublishers.includes(normalizedFileName);
      if (hasProducts) count++;
    }
  });
}
console.log('Virtual publishers with products:', count);
console.log('Total unique publishers in excel:', new Set(excelPublishers).size);
