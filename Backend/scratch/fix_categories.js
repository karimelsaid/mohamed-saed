const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/product.model');
const { categoryMap } = require('../services/excel.service');

async function fixCategories() {
    try {
        console.log('🚀 Starting category fix script...');
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        let totalUpdated = 0;

        for (const [shortKey, fullName] of Object.entries(categoryMap)) {
            const result = await Product.updateMany(
                { product_category: shortKey },
                { $set: { product_category: fullName } }
            );
            if (result.modifiedCount > 0) {
                console.log(`✅ Updated ${result.modifiedCount} products: "${shortKey}" -> "${fullName}"`);
                totalUpdated += result.modifiedCount;
            }
        }

        console.log(`✨ Total products updated: ${totalUpdated}`);

        // Update local JSONs too
        const filesToUpdate = ['output_raw.json', 'output.json'];
        filesToUpdate.forEach(fileName => {
            const filePath = path.join(__dirname, '../', fileName);
            if (fs.existsSync(filePath)) {
                try {
                    let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    if (Array.isArray(data)) {
                        let fileUpdated = false;
                        data.forEach(p => {
                            if (categoryMap[p.product_category]) {
                                p.product_category = categoryMap[p.product_category];
                                fileUpdated = true;
                            }
                        });
                        if (fileUpdated) {
                            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                            console.log(`📄 Updated local ${fileName}.`);
                        }
                    }
                } catch (err) {
                    console.error(`❌ Error updating ${fileName}:`, err.message);
                }
            }
        });

    } catch (error) {
        console.error('❌ Fix failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

fixCategories();
