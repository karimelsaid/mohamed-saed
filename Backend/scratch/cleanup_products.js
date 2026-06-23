const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/product.model');
const { updateExcelFromJson } = require('../services/excel.service');

async function cleanup() {
    try {
        console.log('🚀 Starting deep cleanup script...');
        
        // 1. Connect to MongoDB
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) throw new Error('Missing MONGO_URI in .env');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // 2. Find the last 319 products
        const productsToDelete = await Product.find({})
            .sort({ _id: -1 })
            .limit(319);

        if (productsToDelete.length === 0) {
            console.log('ℹ️ No products found to delete in MongoDB.');
        } else {
            const barcodesToDelete = productsToDelete.map(p => p.barcode);
            console.log(`🔍 Found ${productsToDelete.length} products to delete.`);

            // 3. Delete from MongoDB
            const result = await Product.deleteMany({
                barcode: { $in: barcodesToDelete }
            });
            console.log(`🗑️ Deleted ${result.deletedCount} products from MongoDB.`);

            // 4. Update local JSON files
            const filesToUpdate = ['output_raw.json', 'output.json'];
            filesToUpdate.forEach(fileName => {
                const filePath = path.join(__dirname, '../', fileName);
                if (fs.existsSync(filePath)) {
                    try {
                        let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                        if (Array.isArray(data)) {
                            const originalCount = data.length;
                            data = data.filter(p => !barcodesToDelete.includes(p.barcode) && !barcodesToDelete.includes(p.products_id));
                            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                            console.log(`📄 Updated local ${fileName}: Removed ${originalCount - data.length} rows.`);
                        }
                    } catch (err) {
                        console.error(`❌ Error updating ${fileName}:`, err.message);
                    }
                } else {
                    console.log(`ℹ️ File ${fileName} not found at ${filePath}, skipping.`);
                }
            });

            // 5. Sync back to Google Drive Excel
            console.log('📤 Syncing updated data to Google Drive...');
            const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
            if (fileId) {
                await updateExcelFromJson(fileId);
                console.log('✅ Main Excel file on Google Drive updated.');
                
                const updateFileId = process.env.GOOGLE_DRIVE_FILE_update;
                if (updateFileId && updateFileId !== fileId) {
                    await updateExcelFromJson(updateFileId);
                    console.log('✅ Update Excel file on Google Drive updated.');
                }
            } else {
                console.log('⚠️ GOOGLE_DRIVE_FILE_ID not found in .env, skipping Drive sync.');
            }
        }

        console.log('✨ Deep cleanup complete! The Google Sheet should now be in sync.');

    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

cleanup();
