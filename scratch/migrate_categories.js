const { connectDB } = require('../Backend/config/database');
const Ebook = require('../Backend/models/Ebook.model');
const Product = require('../Backend/models/Product.model');

const legacyCategoryMap = {
    'Business-Marketing-Finance': 'أعمال وتسويق ومالية',
    'Business-marketing-finance': 'أعمال وتسويق ومالية',
    'Education-children': 'تربية وأطفال',
    'Arts-crafts': 'فنون وحرف',
    'HealthMedicineScience': 'صحة وطب وعلوم',
    'Healthmedicinescience': 'صحة وطب وعلوم',
    'Islamic': 'كتب دينية',
    'Novels-stories': 'روايات وقصص',
    'Self-development-psychology': 'تطوير الذات وعلم النفس',
    'History-Biographies': 'تاريخ وسير ذاتية',
    'History-biographies': 'تاريخ وسير ذاتية',
    'Dictionaries-References': 'قواميس ومراجع',
    'Dictionaries-references': 'قواميس ومراجع',
    'office-supplies': 'أدوات مكتبية'
};

connectDB().then(async () => {
    let updatedCount = 0;
    let fallbackCount = 0;
    const ebooks = await Ebook.find({}).lean();
    for (const eb of ebooks) {
        let prod = null;
        if (eb.relatedProductId) {
            prod = await Product.findOne({
                $or: [
                    { products_id: eb.relatedProductId },
                    { barcode: eb.relatedProductId }
                ]
            }).lean();
        }
        if (!prod) {
            prod = await Product.findOne({ linkedEbookId: eb._id }).lean();
        }
        if (!prod) {
            prod = await Product.findOne({ product_name: eb.title }).lean();
        }
        
        let newCategory = '';
        if (prod && prod.product_category) {
            newCategory = prod.product_category;
            updatedCount++;
        } else if (legacyCategoryMap[eb.category]) {
            newCategory = legacyCategoryMap[eb.category];
            fallbackCount++;
        } else {
            newCategory = eb.category;
        }

        if (newCategory !== eb.category) {
            await Ebook.updateOne({ _id: eb._id }, { $set: { category: newCategory } });
            console.log(`Updated "${eb.title}" category: ${eb.category} -> ${newCategory}`);
        }
    }
    console.log(`Migration completed. Updated from products: ${updatedCount}, Updated from fallback map: ${fallbackCount}`);
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
