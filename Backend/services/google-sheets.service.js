const { google } = require('googleapis');
const { auth } = require('../config/drive');
const AutomationSetting = require('../models/AutomationSetting.model');

function cleanPrice(val) {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') {
        const s = val.toString();
        if (val < 10 && s.includes('.') && s.split('.')[1].length === 3) {
            return val * 1000;
        }
        return val;
    }
    let s = String(val).trim();
    s = s.replace(/[^\d.,]/g, '');
    if (s.includes('.') && s.split('.')[1].length === 3 && !s.includes(',')) {
        return parseFloat(s.replace('.', ''));
    }
    return parseFloat(s.replace(/,/g, '')) || 0;
}

class GoogleSheetsService {
    constructor() {
        this.sheets = google.sheets({ version: 'v4', auth });
    }

    /**
     * Get configured Google Sheet ID from settings.
     */
    async getSheetId() {
        const settings = await AutomationSetting.getInstance();
        return settings.googleSheetEnabled ? settings.googleSheetId : null;
    }

    /**
     * Sync a product (Insert or Update) to Google Sheets.
     */
    async syncProduct(productData) {
        try {
            const spreadsheetId = await this.getSheetId();
            if (!spreadsheetId) return null;

            // Dynamically get the first sheet name
            const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId });
            const sheetName = spreadsheet.data.sheets[0].properties.title;
            const sheetId = spreadsheet.data.sheets[0].properties.sheetId;
            const range = `${sheetName}!A:AZ`;

            // Prepare the row data based on excel.service.js structure
            const row = this.mapProductToRow(productData);

            // 1. Search for existing product by barcode (Column B)
            const barcode = String(productData.barcode || '').trim();
            const existingRowIndex = await this.findRowIndexByBarcode(spreadsheetId, sheetName, barcode);

            if (existingRowIndex !== -1) {
                // UPDATE
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!A${existingRowIndex + 1}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [row] }
                });
                console.log(`✅ [GoogleSheetsService] Product updated: ${productData.product_name}`);
            } else {
                // APPEND
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: [row] }
                });
                console.log(`✅ [GoogleSheetsService] Product appended: ${productData.product_name}`);
            }

            return true;
        } catch (error) {
            console.error('❌ [GoogleSheetsService] Sync Error:', error.message);
            return false;
        }
    }

    /**
     * Map product object to an array for Google Sheets row.
     */
    mapProductToRow(p) {
        return [
            p.products_id || '',
            p.barcode || '',
            p.product_name || '',
            p.product_quantity || 0,
            p.product_category || '',
            p.product_description || '',
            p.product_price || 0,
            p.price_cost || 0,
            p.merchantId ? p.merchantId.toString() : '',
            p.image_path || '',
            p.weight || 0,
            p.author || '',
            p.publisher || '',
            p.pages || '',
            p.coverType || '',
            p.language || '',
            p.publishYear || '',
            p.stationeryType || '',
            p.material || '',
            p.color || '',
            p.size || '',
            p.brand || '',
            p.electronicsType || '',
            p.model || '',
            p.specs || '',
            p.warranty || '',
            p.clothingType || '',
            p.season || '',
            p.originCountry || '',
            p.cosmeticsType || '',
            p.sizeWeight || '',
            p.ingredients || '',
            p.suitableFor || '',
            p.shoeType || '',
            p.furnitureType || '',
            p.height || '',
            p.deliveryMethod || '',
            p.toyType || '',
            p.ageGroup || '',
            p.safety || '',
            p.fabricType || '',
            p.width || '',
            p.length || '',
            p.usage || '',
            p.suggestedCategory || '',
            p.createdAt || new Date().toISOString()
        ];
    }

    /**
     * Find the row index of a product by its barcode.
     */
    async findRowIndexByBarcode(spreadsheetId, sheetName, barcode) {
        if (!barcode) return -1;

        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!B:B`, // Barcode is in Column B
        });

        const rows = response.data.values;
        if (!rows) return -1;

        return rows.findIndex(row => String(row[0] || '').trim() === barcode);
    }

    /**
     * Remove a product row from Google Sheets by barcode.
     */
    async removeProduct(barcode) {
        try {
            const spreadsheetId = await this.getSheetId();
            if (!spreadsheetId) return null;

            const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId });
            const sheetName = spreadsheet.data.sheets[0].properties.title;
            const sheetId = spreadsheet.data.sheets[0].properties.sheetId;
            const rowIndex = await this.findRowIndexByBarcode(spreadsheetId, sheetName, barcode);

            if (rowIndex !== -1) {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId,
                                    dimension: 'ROWS',
                                    startIndex: rowIndex,
                                    endIndex: rowIndex + 1
                                }
                            }
                        }]
                    }
                });
                console.log(`✅ [GoogleSheetsService] Product removed: ${barcode}`);
            }
            return true;
        } catch (error) {
            console.error('❌ [GoogleSheetsService] Remove Error:', error.message);
            return false;
        }
    }

    /**
     * Map a row array from Google Sheets back to a product object.
     */
    mapRowToProduct(row) {
        let result = {
            products_id: row[0] || '',
            product_name: row[1] || '',
            product_quantity: 0,
            product_category: '',
            product_description: '',
            product_price: 0,
            barcode: row[0] || '',
            product_image: '',
            digitalDelivery: false,
            product_discount_percent: 0,
            status: 'approved'
        };

        const categoryKeywords = [
            'كتب دينية', 'روايات وقصص', 'تطوير الذات', 'علم النفس', 'تاريخ', 'سير ذاتية', 
            'تربية وأطفال', 'سياسة', 'اقتصاد', 'أعمال وتسويق ومالية', 'قواميس ومراجع', 
            'صحة وطب وعلوم', 'فنون وحرف', 'مستندات', 'طباعة', 'أدوات مكتبية'
        ];

        let numericFound = 0;
        for (let i = 2; i < row.length; i++) {
            let val = String(row[i] || '').trim();
            if (!val) continue;

            if (val.includes('/uploads/')) {
                result.product_image = val;
                continue;
            }

            if (val === 'TRUE' || val === 'FALSE') {
                result.digitalDelivery = (val === 'TRUE');
                continue;
            }

            if (val.length > 55) {
                result.product_description = val;
                continue;
            }

            if (categoryKeywords.some(cat => val.includes(cat))) {
                result.product_category = val;
                continue;
            }

            if (/^\d+(\.\d+)?$/.test(val) || val.includes('.')) {
                const num = parseFloat(val);
                numericFound++;
                
                if (numericFound === 1) result.product_quantity = num;
                else if (numericFound === 2) result.product_price = cleanPrice(val);
                else if (numericFound === 3 && num < 100) result.product_discount_percent = num;
                else if (numericFound > 3 && !result.barcode) result.barcode = val;
            } else if (val.length > 5 && val.length < 55 && !result.product_category) {
                result.product_category = val;
            }
        }

        if (!result.barcode) result.barcode = result.products_id;
        
        return result;
    }

    async ensureSheetExists(spreadsheetId, sheetName, headers) {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId });
            const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);

            if (!sheet) {
                console.log(`📡 [GoogleSheetsService] Creating new sheet: "${sheetName}"`);
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        requests: [
                            { addSheet: { properties: { title: sheetName } } }
                        ]
                    }
                });

                await this.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [headers] }
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ [GoogleSheetsService] EnsureSheet Error:', error.message);
            return false;
        }
    }

    /**
     * Map user document to row data for Google Sheets.
     */
    mapUserToRow(u) {
        return [
            u._id.toString(),
            u.username || '',
            u.email || '',
            u.phone || '',
            u.gender || '',
            u.role || '',
            u.isSheikh ? 'TRUE' : 'FALSE',
            u.approved ? 'TRUE' : 'FALSE',
            u.suspended ? 'TRUE' : 'FALSE',
            u.governorate || '',
            u.city || '',
            u.village || '',
            u.postOffice?.governorate || '',
            u.postOffice?.city || '',
            u.postOffice?.address || '',
            u.postOffice?.name || '',
            u.activeSubscription ? 'TRUE' : 'FALSE',
            u.subscriptionEndDate ? (typeof u.subscriptionEndDate.toISOString === 'function' ? u.subscriptionEndDate.toISOString() : String(u.subscriptionEndDate)) : '',
            u.quranProgress?.walletBalance || 0,
            u.referralBalance || 0,
            u.gamification?.coins || 0,
            u.gamification?.xp || 0,
            u.gamification?.level || 1,
            u.marketer?.isMarketer ? 'TRUE' : 'FALSE',
            u.marketer?.balance || 0,
            u.marketer?.totalEarnings || 0,
            u.createdAt ? (typeof u.createdAt.toISOString === 'function' ? u.createdAt.toISOString() : String(u.createdAt)) : ''
        ];
    }

    /**
     * Find row index of a user in sheets by User ID (Column A).
     */
    async findRowIndexByUserId(spreadsheetId, sheetName, userId) {
        if (!userId) return -1;
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A:A`,
            });
            const rows = response.data.values;
            if (!rows) return -1;
            return rows.findIndex(row => String(row[0] || '').trim() === userId);
        } catch (e) {
            console.error('Error finding row index by userId:', e.message);
            return -1;
        }
    }

    /**
     * Sync all users to the "العملاء" sheet.
     */
    async syncUsers(users) {
        try {
            const settings = await AutomationSetting.getInstance();
            const spreadsheetId = settings.customerBackupSheetId || settings.googleSheetId;
            if (!spreadsheetId) return null;

            const sheetName = 'العملاء';
            const headers = [
                'User ID', 'Username', 'Email', 'Phone', 'Gender', 'Role', 'Is Sheikh', 'Approved', 'Suspended',
                'Governorate', 'City', 'Village', 'Post Office Governorate', 'Post Office City', 'Post Office Address', 'Post Office Name',
                'Active Subscription', 'Subscription End Date', 'Wallet Balance', 'Referral Balance', 'Coins', 'XP', 'Level',
                'Is Marketer', 'Marketer Balance', 'Marketer Total Earnings', 'Created At'
            ];
            
            await this.ensureSheetExists(spreadsheetId, sheetName, headers);

            const rows = users.map(u => this.mapUserToRow(u));

            await this.sheets.spreadsheets.values.clear({
                spreadsheetId,
                range: `${sheetName}!A2:AZ`,
            });

            if (rows.length > 0) {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!A2`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: rows }
                });
            }

            console.log(`✅ [GoogleSheetsService] Synced ${users.length} users to "${sheetName}"`);
            return true;
        } catch (error) {
            console.error('❌ [GoogleSheetsService] User Sync Error:', error.message);
            return false;
        }
    }

    /**
     * Sync a single user (insert or update) to the "العملاء" sheet.
     */
    async syncSingleUser(user) {
        try {
            const settings = await AutomationSetting.getInstance();
            const spreadsheetId = settings.customerBackupSheetId || settings.googleSheetId;
            if (!spreadsheetId) return null;

            const sheetName = 'العملاء';
            const headers = [
                'User ID', 'Username', 'Email', 'Phone', 'Gender', 'Role', 'Is Sheikh', 'Approved', 'Suspended',
                'Governorate', 'City', 'Village', 'Post Office Governorate', 'Post Office City', 'Post Office Address', 'Post Office Name',
                'Active Subscription', 'Subscription End Date', 'Wallet Balance', 'Referral Balance', 'Coins', 'XP', 'Level',
                'Is Marketer', 'Marketer Balance', 'Marketer Total Earnings', 'Created At'
            ];
            
            await this.ensureSheetExists(spreadsheetId, sheetName, headers);

            const row = this.mapUserToRow(user);
            const existingRowIndex = await this.findRowIndexByUserId(spreadsheetId, sheetName, user._id.toString());

            if (existingRowIndex !== -1) {
                // UPDATE
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!A${existingRowIndex + 1}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [row] }
                });
                console.log(`✅ [GoogleSheetsService] User updated in sheet: ${user.email}`);
            } else {
                // APPEND
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range: `${sheetName}!A:AZ`,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: [row] }
                });
                console.log(`✅ [GoogleSheetsService] User appended to sheet: ${user.email}`);
            }

            return true;
        } catch (error) {
            console.error('❌ [GoogleSheetsService] Single User Sync Error:', error.message);
            return false;
        }
    }

    async getAllProducts() {
        try {
            const spreadsheetId = await this.getSheetId();
            if (!spreadsheetId) return [];

            const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId });
            const sheetName = spreadsheet.data.sheets[0].properties.title;
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A:AZ`,
            });

            const rows = response.data.values;
            if (!rows || rows.length <= 1) return [];

            return rows.slice(1).map(row => this.mapRowToProduct(row));
        } catch (error) {
            console.error('❌ [GoogleSheetsService] Fetch Error:', error.message);
            return [];
        }
    }

    /**
     * Sync all products (Clear & Overwrite) to Google Sheets.
     */
    async syncAllProducts(products) {
        try {
            const spreadsheetId = await this.getSheetId();
            if (!spreadsheetId) return null;

            const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId });
            const sheetName = spreadsheet.data.sheets[0].properties.title;
            
            // 1. Prepare all rows
            const rows = products.map(p => this.mapProductToRow(p));
            
            // 2. Clear current data (A2:AZ) to keep headers
            await this.sheets.spreadsheets.values.clear({
                spreadsheetId,
                range: `${sheetName}!A2:AZ`,
            });

            // 3. Update with new data
            if (rows.length > 0) {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!A2`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: rows }
                });
            }

            console.log(`✅ [GoogleSheetsService] Full sync completed: ${products.length} products`);
            return true;
        } catch (error) {
            console.error('❌ [GoogleSheetsService] Full Sync Error:', error.message);
            return false;
        }
    }
}

module.exports = new GoogleSheetsService();
