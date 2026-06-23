/**
 * Fix price_cost = 0 for publisher products in Google Sheets + MongoDB
 * 
 * Correct column mapping from Sheet:
 *   A(0): products_id, B(1): product_name, C(2): product_price, D(3): price_cost,
 *   E(4): product_quantity, F(5): product_category, G(6): product_description,
 *   H(7): product_image, ... N(13): barcode, ... Q(16): publisher
 */

const { google } = require('googleapis');
const { auth } = require('./config/drive');
const mongoose = require('mongoose');
require('dotenv').config();

const SPREADSHEET_ID = process.env.GOOGLE_DRIVE_FILE_ID || '14rJuJj-aUG3pvDE3B2yYoGPuOTxXqzRkhR_EW0c4iGo';
const MONGO_URI = process.env.MONGO_URI;

// Correct column indices (0-based) from actual Sheet headers
const COL_PRODUCTS_ID = 0;
const COL_PRODUCT_NAME = 1;
const COL_PRODUCT_PRICE = 2;
const COL_PRICE_COST = 3;
const COL_BARCODE = 13;
const COL_PUBLISHER = 16;

async function main() {
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Get sheet name
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetName = spreadsheet.data.sheets[0].properties.title;
    console.log(`📊 Sheet name: "${sheetName}"`);

    // 2. Read all data
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:AZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
        console.log('❌ No data found in sheet');
        return;
    }

    console.log(`📦 Total rows (including header): ${rows.length}`);

    // 3. Find rows to update
    const updates = [];
    
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const publisher = (row[COL_PUBLISHER] || '').trim();
        const productPrice = parseFloat(row[COL_PRODUCT_PRICE]) || 0;
        const priceCost = parseFloat(row[COL_PRICE_COST]) || 0;
        const productName = (row[COL_PRODUCT_NAME] || '').trim();
        const barcode = (row[COL_BARCODE] || '').trim();
        const productsId = (row[COL_PRODUCTS_ID] || '').trim();

        if (publisher && priceCost === 0 && productPrice > 0) {
            const newPriceCost = Math.round(productPrice * 0.9 * 100) / 100;
            updates.push({
                rowIndex: i + 1, // 1-based for Google Sheets
                newPriceCost,
                productName,
                barcode: barcode || productsId,
                productsId,
                productPrice,
                publisher
            });
        }
    }

    console.log(`\n🔍 Found ${updates.length} products with publisher and price_cost = 0\n`);

    if (updates.length === 0) {
        console.log('✅ Nothing to update!');
        return;
    }

    // Show first 30 for preview
    console.log('Preview (first 30):');
    updates.slice(0, 30).forEach(u => {
        console.log(`  - [${u.productsId}] ${u.productName} | price: ${u.productPrice} → cost: ${u.newPriceCost} | publisher: ${u.publisher}`);
    });
    if (updates.length > 30) {
        console.log(`  ... and ${updates.length - 30} more`);
    }

    // 4. Update Google Sheet - column D is price_cost
    console.log('\n📝 Updating Google Sheet (column D = price_cost)...');
    
    const batchData = updates.map(u => ({
        range: `${sheetName}!D${u.rowIndex}`,
        values: [[u.newPriceCost]]
    }));

    const CHUNK_SIZE = 100;
    for (let c = 0; c < batchData.length; c += CHUNK_SIZE) {
        const chunk = batchData.slice(c, c + CHUNK_SIZE);
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: chunk
            }
        });
        console.log(`  ✅ Updated sheet rows ${c + 1} to ${Math.min(c + CHUNK_SIZE, batchData.length)} of ${batchData.length}`);
    }

    // 5. Update MongoDB
    console.log('\n🗄️ Updating MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('  Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('products');

    let dbUpdated = 0;
    let dbNotFound = 0;

    for (const u of updates) {
        // Try multiple matching strategies
        const filter = {
            $or: [
                { barcode: u.barcode },
                { products_id: u.productsId },
                { barcode: u.productsId },
                { products_id: u.barcode }
            ]
        };

        const result = await collection.updateMany(filter, {
            $set: { price_cost: u.newPriceCost }
        });

        if (result.modifiedCount > 0) {
            dbUpdated += result.modifiedCount;
        } else {
            dbNotFound++;
            // Try by name as last resort
            const byName = await collection.updateMany(
                { product_name: u.productName, publisher: u.publisher },
                { $set: { price_cost: u.newPriceCost } }
            );
            if (byName.modifiedCount > 0) {
                dbUpdated += byName.modifiedCount;
                dbNotFound--;
            }
        }
    }

    console.log(`  ✅ MongoDB: ${dbUpdated} documents updated, ${dbNotFound} not found`);

    // 6. Also update local output.json and output_raw.json
    const fs = require('fs');
    const path = require('path');

    for (const filename of ['output.json', 'output_raw.json']) {
        const filePath = path.join(__dirname, filename);
        if (fs.existsSync(filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                let localUpdated = 0;

                for (const product of data) {
                    const publisher = (product.publisher || '').trim();
                    const priceCost = parseFloat(product.price_cost) || 0;
                    const productPrice = parseFloat(product.product_price) || 0;

                    if (publisher && priceCost === 0 && productPrice > 0) {
                        product.price_cost = Math.round(productPrice * 0.9 * 100) / 100;
                        localUpdated++;
                    }
                }

                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
                console.log(`  ✅ ${filename}: ${localUpdated} products updated`);
            } catch (err) {
                console.log(`  ⚠️ ${filename}: ${err.message}`);
            }
        } else {
            console.log(`  ⚠️ ${filename} not found locally`);
        }
    }

    await mongoose.disconnect();
    console.log('\n🎉 All done!');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
