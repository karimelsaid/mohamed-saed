/**
 * Revert the wrong updates made to column H (product_image) - restore original values
 * Then run the correct fix on column D (price_cost)
 */
const { google } = require('googleapis');
const { auth } = require('./config/drive');
require('dotenv').config();

const SPREADSHEET_ID = process.env.GOOGLE_DRIVE_FILE_ID;

async function main() {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetName = spreadsheet.data.sheets[0].properties.title;

    // Read all data to find damaged rows (col H should have product_image values, not decimal numbers)
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:AZ`,
    });

    const rows = response.data.values;
    const header = rows[0];
    console.log(`Col H header: "${header[7]}"`); // Should be "product_image"

    // Column H (index 7) = product_image. The wrong script wrote decimal numbers here.
    // The original product_image value should match products_id (col A, index 0)
    const fixes = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const colH = (row[7] || '').toString().trim();
        const productsId = (row[0] || '').toString().trim();
        
        // If col H is a decimal number like "2.7", "22.5", "36", "54", "90", "45", "26.1"
        // these are the wrong values we wrote. Original should be the products_id
        if (colH && /^\d+\.?\d*$/.test(colH) && colH.includes('.')) {
            console.log(`  Row ${i+1}: Col H = "${colH}" (should be "${productsId}")`);
            fixes.push({
                range: `${sheetName}!H${i + 1}`,
                values: [[productsId]]
            });
        }
    }

    console.log(`\nFound ${fixes.length} rows with damaged col H values`);

    if (fixes.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: fixes
            }
        });
        console.log('✅ Reverted column H values');
    }
}

main().catch(err => console.error(err.message));
