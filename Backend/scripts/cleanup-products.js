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
    'كتب',
    'غير مصنف'
];

function cleanupFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }

    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const products = JSON.parse(rawData);
        
        const filteredProducts = products.filter(p => {
            return allowedCategories.includes(p.product_category);
        });

        const deletedCount = products.length - filteredProducts.length;
        
        if (deletedCount > 0) {
            fs.writeFileSync(filePath, JSON.stringify(filteredProducts, null, 2));
            console.log(`[${path.basename(filePath)}] Deleted ${deletedCount} products. Remaining: ${filteredProducts.length}`);
        } else {
            console.log(`[${path.basename(filePath)}] No products to delete.`);
        }
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
    }
}

// Target files
const files = [
    'Backend/output.json',
    'Backend/output_raw.json'
];

files.forEach(cleanupFile);

console.log('Cleanup complete.');
