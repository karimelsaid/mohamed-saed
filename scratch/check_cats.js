const { connectDB } = require('../Backend/config/database');
const Ebook = require('../Backend/models/Ebook.model');
const Product = require('../Backend/models/Product.model');

connectDB().then(async () => {
    const ebooks = await Ebook.find({}).limit(15).lean();
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
        console.log({
            title: eb.title,
            ebookCat: eb.category,
            relatedProductId: eb.relatedProductId,
            prodCat: prod ? prod.product_category : 'No product found'
        });
    }
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
