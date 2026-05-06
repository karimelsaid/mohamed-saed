const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/product.model');
const { updateExcelFromJson } = require('../services/excel.service');

async function deleteLoloa() {
    try {
        console.log('🚀 Starting deletion of "Dar Al-Loloa" products...');
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Find the barcodes
        const productsToDelete = await Product.find({ publisher: /اللؤلؤة/ });
        if (productsToDelete.length === 0) {
            console.log('ℹ️ No products found for Dar Al-Loloa.');
            return;
        }
        
        const barcodesToDelete = productsToDelete.map(p => String(p.barcode || p.products_id).trim());
        console.log(`🔍 Found ${barcodesToDelete.length} products to delete.`);

        // 2. Delete from MongoDB
        const mongoRes = await Product.deleteMany({
            barcode: { $in: barcodesToDelete }
        });
        console.log(`🗑️ Deleted ${mongoRes.deletedCount} products from MongoDB.`);

        // 3. Update local JSON files
        const filesToUpdate = ['output_raw.json', 'output.json'];
        filesToUpdate.forEach(fileName => {
            const filePath = path.join(__dirname, '../', fileName);
            if (fs.existsSync(filePath)) {
                try {
                    let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    if (Array.isArray(data)) {
                        const originalCount = data.length;
                        data = data.filter(p => !barcodesToDelete.includes(String(p.barcode || p.products_id).trim()));
                        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                        console.log(`📄 Updated local ${fileName}: Removed ${originalCount - data.length} rows.`);
                    }
                } catch (err) {
                    console.error(`❌ Error updating ${fileName}:`, err.message);
                }
            }
        });

        // 4. Sync back to Google Drive
        console.log('📤 Syncing changes to Google Drive...');
        const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
        if (fileId) {
            await updateExcelFromJson(fileId);
            console.log('✅ Google Drive Excel updated.');
        }

        console.log('✨ Deletion complete! You can now re-import the Loloa file.');

    } catch (error) {
        console.error('❌ Deletion failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

deleteLoloa();
