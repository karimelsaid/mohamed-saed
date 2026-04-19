const { google } = require('googleapis');
require('dotenv').config();
const { auth } = require('./config/drive');

async function verify() {
    try {
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = '14rJuJj-aUG3pvDE3B2yYoGPuOTxXqzRkhR_EW0c4iGo';
        
        console.log('--- Spreadsheet Metadata ---');
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        console.log('Title:', meta.data.properties.title);
        console.log('Sheets (Tabs):', meta.data.sheets.map(s => s.properties.title).join(', '));
        
        const timestamp = new Date().toISOString();
        const testRow = ['VERIFY_TEST', 'Test User', 'test@example.com', '0123456789', 'user', '', '', '', '', '0', '0', timestamp];
        
        console.log('\n--- Writing Test Row to "العملاء" ---');
        const appendRes = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'العملاء!A:AZ',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [testRow] }
        });
        
        console.log('Append Status:', appendRes.status, appendRes.statusText);
        console.log('Updated Range:', appendRes.data.updates.updatedRange);
        
        console.log('\n--- Reading Back Last 3 Rows ---');
        const readRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'العملاء!A:L'
        });
        const rows = readRes.data.values || [];
        console.log('Current Row Count:', rows.length);
        console.log('Last 3 rows:', JSON.stringify(rows.slice(-3), null, 2));

    } catch (error) {
        console.error('FAILED:', error.message);
    }
}
verify();
