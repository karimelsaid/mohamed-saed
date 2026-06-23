
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

// Define simplified models for cleanup
const ProductSchema = new mongoose.Schema({ products_id: String, barcode: String, is_digital: Boolean, createdAt: Date }, { strict: false });
const EbookSchema = new mongoose.Schema({ title: String, createdAt: Date }, { strict: false });

const Product = mongoose.model('Product', ProductSchema);
const Ebook = mongoose.model('Ebook', EbookSchema);

async function runCleanup() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const minDate = new Date('2026-05-14T00:00:00Z');
        const minTimestamp = minDate.getTime();

        // 1. Delete Products (including DIG- IDs and recently created ones)
        const productDeleteResult = await Product.deleteMany({
            $or: [
                { createdAt: { $gte: minDate } },
                { products_id: { $regex: /^DIG-/ }, products_id: { $exists: true } } // We'll refine this in JS if needed
            ]
        });
        
        // Actually, let's be more precise with the DIG- regex to check timestamps
        const allDigitalProducts = await Product.find({ products_id: { $regex: /^DIG-/ } });
        const digitalIdsToDelete = allDigitalProducts
            .filter(p => {
                const ts = parseInt(p.products_id.split('-')[1]);
                return ts >= minTimestamp;
            })
            .map(p => p._id);

        const preciseDeleteResult = await Product.deleteMany({
            $or: [
                { _id: { $in: digitalIdsToDelete } },
                { createdAt: { $gte: minDate } }
            ]
        });

        console.log(`✅ Deleted ${preciseDeleteResult.deletedCount} products from MongoDB`);

        // 2. Delete Ebooks
        const ebookDeleteResult = await Ebook.deleteMany({
            createdAt: { $gte: minDate }
        });
        console.log(`✅ Deleted ${ebookDeleteResult.deletedCount} ebooks from MongoDB`);

        // 3. Clean local files (extra safety)
        const baseDir = '/Users/orabi/Downloads/kenouz/Backend';
        const outputPath = path.join(baseDir, 'output.json');
        const rawPath = path.join(baseDir, 'output_raw.json');

        function cleanupLocalJson(filePath) {
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const filtered = data.filter(p => {
                    if (String(p.products_id).startsWith('DIG-')) {
                        const ts = parseInt(p.products_id.split('-')[1]);
                        return ts < minTimestamp;
                    }
                    if (p.createdAt) {
                        return new Date(p.createdAt) < minDate;
                    }
                    return true;
                });
                fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2));
                console.log(`✅ Cleaned local file: ${filePath}`);
            }
        }

        cleanupLocalJson(outputPath);
        cleanupLocalJson(rawPath);

        await mongoose.disconnect();
        console.log('Cleanup complete');
    } catch (err) {
        console.error('Cleanup failed:', err);
    }
}

runCleanup();
