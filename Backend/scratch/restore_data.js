const { google } = require('googleapis');
const { auth } = require('../config/drive');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/product.model');

async function restore() {
    try {
        console.log('🔄 Starting full restoration process...');
        const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
        const revisionId = '25'; // The state before my cleanup

        const client = await auth.getClient();
        const drive = google.drive({ version: 'v3', auth: client });

        // 1. Download revision 25 as XLSX
        console.log(`📥 Downloading revision ${revisionId}...`);
        // We use the export link logic
        const res = await client.request({
            url: `https://docs.google.com/spreadsheets/export?id=${fileId}&revision=${revisionId}&exportFormat=xlsx`,
            responseType: 'arraybuffer'
        });

        const buffer = Buffer.from(res.data);
        fs.writeFileSync(path.join(__dirname, '../restored_backup.xlsx'), buffer);
        console.log('✅ Revision 25 downloaded as restored_backup.xlsx');

        // 2. Parse XLSX to JSON
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const json = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        console.log(`📊 Parsed ${json.length} products from backup.`);

        // 3. Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 4. Repopulate MongoDB
        // We'll use bulkWrite to upsert all products from the backup
        const bulkOps = json.map(p => {
            const barcode = String(p.barcode || p.products_id).trim();
            // Map JSON fields back to model if necessary
            // Note: excel.service.js uses specific mapping, but here we assume output_raw style
            return {
                updateOne: {
                    filter: { barcode: barcode },
                    update: { $set: { ...p, barcode } },
                    upsert: true
                }
            };
        });

        if (bulkOps.length > 0) {
            await Product.bulkWrite(bulkOps);
            console.log(`✅ MongoDB repopulated with ${bulkOps.length} products.`);
        }

        // 5. Update local JSON files
        fs.writeFileSync(path.join(__dirname, '../output_raw.json'), JSON.stringify(json, null, 2));
        console.log('📄 output_raw.json restored.');
        
        // Also update output.json (processed version)
        // Note: Ideally we'd run processAndSaveData here, but we'll do it later or just save raw
        fs.writeFileSync(path.join(__dirname, '../output.json'), JSON.stringify(json, null, 2));
        console.log('📄 output.json restored (raw state).');

        // 6. Upload back to Google Drive (Overwrite the "Dirty" current version)
        console.log('📤 Uploading restored data back to Google Drive...');
        await drive.files.update({
            fileId: fileId,
            media: {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                body: buffer
            }
        });
        console.log('✅ Google Drive Excel restored to revision 25 state.');

        console.log('✨ RESTORATION COMPLETE! Everything is back to the state before the mistake.');

    } catch (error) {
        console.error('❌ Restoration failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

restore();
