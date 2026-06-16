/**
 * Debug: Read the first 3 rows from the Google Sheet to understand column mapping
 */
const { google } = require('googleapis');
const { auth } = require('./config/drive');
require('dotenv').config();

const SPREADSHEET_ID = process.env.GOOGLE_DRIVE_FILE_ID || '14rJuJj-aUG3pvDE3B2yYoGPuOTxXqzRkhR_EW0c4iGo';

async function main() {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetName = spreadsheet.data.sheets[0].properties.title;

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:AZ4`,
    });

    const rows = response.data.values;
    if (!rows) { console.log('No data'); return; }

    // Print header with column letters
    const header = rows[0];
    console.log('=== HEADER ROW ===');
    header.forEach((h, i) => {
        const colLetter = String.fromCharCode(65 + i);
        console.log(`  Col ${colLetter} (index ${i}): "${h}"`);
    });

    // Print row 2 & 3
    for (let r = 1; r < rows.length; r++) {
        console.log(`\n=== ROW ${r + 1} ===`);
        rows[r].forEach((val, i) => {
            const colLetter = String.fromCharCode(65 + i);
            const headerName = header[i] || `(no header)`;
            const display = String(val).length > 80 ? String(val).substring(0, 80) + '...' : val;
            console.log(`  Col ${colLetter} [${headerName}]: "${display}"`);
        });
    }
}

main().catch(err => console.error(err.message));
