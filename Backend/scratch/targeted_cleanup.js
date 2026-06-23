const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/product.model');
const { updateExcelFromJson } = require('../services/excel.service');

async function targetedCleanup() {
    try {
        console.log('🚀 Starting targeted cleanup (Rows 906-1225)...');
        
        // 1. Read local output_raw.json
        const rawPath = path.join(__dirname, '../output_raw.json');
        if (!fs.existsSync(rawPath)) {
            throw new Error('output_raw.json not found. Please ensure restoration was successful.');
        }
        
        let products = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
        console.log(`📊 Total products in local file: ${products.length}`);

        // Excel Row 906 to 1225
        // Assuming Row 1 is header:
        // Excel Row 2 is Index 0.
        // Excel Row N is Index N-2.
        const startRow = 906;
        const endRow = 1225;
        
        const startIndex = startRow - 2;
        const endIndex = endRow - 2;

        const targets = products.slice(startIndex, endIndex + 1);
        
        if (targets.length === 0) {
            console.log('⚠️ No products found in the specified range.');
            return;
        }

        const barcodesToDelete = targets.map(p => String(p.barcode || p.products_id).trim());
        console.log(`🔍 Identified ${targets.length} products for deletion (from "${targets[0].product_name}" to "${targets[targets.length-1].product_name}").`);

        // 2. Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 3. Delete from MongoDB
        const mongoRes = await Product.deleteMany({
            barcode: { $in: barcodesToDelete }
        });
        console.log(`🗑️ Deleted ${mongoRes.deletedCount} products from MongoDB.`);

        // 4. Update local JSON files
        const filteredProducts = products.filter(p => !barcodesToDelete.includes(String(p.barcode || p.products_id).trim()));
        
        fs.writeFileSync(rawPath, JSON.stringify(filteredProducts, null, 2));
        console.log(`📄 Updated output_raw.json: Now has ${filteredProducts.length} products.`);
        
        const outputPath = path.join(__dirname, '../output.json');
        if (fs.existsSync(outputPath)) {
            fs.writeFileSync(outputPath, JSON.stringify(filteredProducts, null, 2));
            console.log('📄 Updated output.json.');
        }

        // 5. Sync back to Google Drive
        console.log('📤 Syncing changes to Google Drive...');
        const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
        if (fileId) {
            await updateExcelFromJson(fileId);
            console.log('✅ Google Drive Main Excel updated.');
            
            const updateFileId = process.env.GOOGLE_DRIVE_FILE_update;
            if (updateFileId && updateFileId !== fileId) {
                await updateExcelFromJson(updateFileId);
                console.log('✅ Google Drive Update Excel updated.');
            }
        }

        console.log('✨ Targeted cleanup complete! Rows 906-1225 are gone.');

    } catch (error) {
        console.error('❌ Targeted cleanup failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

targetedCleanup();
