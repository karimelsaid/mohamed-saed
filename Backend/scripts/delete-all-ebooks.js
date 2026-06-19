const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function deleteAllEbooks() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('❌ MONGO_URI is not defined in .env');
        process.exit(1);
    }

    console.log('Connecting to MongoDB via MongoClient...');
    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        console.log('✅ Connected successfully.');
        const db = client.db('kenouz');

        // 1. Delete local uploads/ebooks folder and recreate it
        const ebooksUploadDir = path.join(__dirname, '../uploads/ebooks');
        if (fs.existsSync(ebooksUploadDir)) {
            console.log(`Deleting local ebooks upload directory: ${ebooksUploadDir}`);
            fs.rmSync(ebooksUploadDir, { recursive: true, force: true });
        }
        fs.mkdirSync(ebooksUploadDir, { recursive: true });
        console.log('✅ Recreated empty local ebooks upload directory.');

        // 2. Delete Ebook Database Records directly
        const ebookDeleteResult = await db.collection('ebooks').deleteMany({});
        console.log(`✅ Deleted ${ebookDeleteResult.deletedCount} Ebook documents.`);

        // 3. Cascade Delete: UserLibrary Entries directly
        const userLibraryDeleteResult = await db.collection('userlibraries').deleteMany({});
        console.log(`✅ Deleted ${userLibraryDeleteResult.deletedCount} UserLibrary documents.`);

        // 4. Cascade Delete: ReadingProgress Entries directly
        const readingProgressDeleteResult = await db.collection('readingprogresses').deleteMany({});
        console.log(`✅ Deleted ${readingProgressDeleteResult.deletedCount} ReadingProgress documents.`);

        // 5. Update products that link to ebooks directly
        const productUpdateResult = await db.collection('products').updateMany(
            { linkedEbookId: { $exists: true } },
            {
                $unset: { linkedEbookId: 1, epubFilePath: 1, miniEpubFilePath: 1 },
                $set: { productType: 'physical', digitalDelivery: false }
            }
        );
        console.log(`✅ Updated ${productUpdateResult.modifiedCount} products (unset linkedEbookId and set to physical).`);

        // Also check if any products are still marked as digital but have no linkedEbookId (just in case)
        const productUpdateResult2 = await db.collection('products').updateMany(
            { productType: 'digital' },
            {
                $unset: { linkedEbookId: 1, epubFilePath: 1, miniEpubFilePath: 1 },
                $set: { productType: 'physical', digitalDelivery: false }
            }
        );
        console.log(`✅ Updated ${productUpdateResult2.modifiedCount} digital products without links to physical.`);

        // 6. Reset ebook mappings
        const mappingPath = path.join(__dirname, '..', 'ebook-mappings.json');
        fs.writeFileSync(mappingPath, JSON.stringify({}, null, 2));
        console.log('✅ Reset ebook-mappings.json to empty object.');

        console.log('🎉 Ebook database cleanup completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during database cleanup:', error);
        process.exit(1);
    } finally {
        await client.close();
    }
}

deleteAllEbooks();
