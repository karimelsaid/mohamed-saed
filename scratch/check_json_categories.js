
const fs = require('fs');
const path = require('path');

const allowedCategories = [
  'روايات وقصص',
  'تطوير الذات وعلم النفس',
  'كتب دينية',
  'قواميس ومراجع',
  'صحة وطب وعلوم',
  'أعمال وتسويق ومالية',
  'فنون وحرف',
  'تاريخ وسير ذاتية',
  'تربية وأطفال',
  'أدوات مكتبية',
  'غير مصنف'
];

function checkFiles() {
  const files = ['output.json', 'output_raw.json'];
  
  files.forEach(file => {
    const filePath = path.join(__dirname, '../Backend', file);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const badProducts = data.filter(p => !allowedCategories.includes(p.product_category));
      
      console.log(`File: ${file}`);
      console.log(`Total Products: ${data.length}`);
      console.log(`Products with non-standard categories: ${badProducts.length}`);
      
      if (badProducts.length > 0) {
        const badCats = [...new Set(badProducts.map(p => p.product_category))];
        console.log('Categories found:', badCats);
        console.log('Sample bad product:', badProducts[0]);
      }
      console.log('---');
    } else {
      console.log(`File ${file} not found.`);
    }
  });
}

checkFiles();
