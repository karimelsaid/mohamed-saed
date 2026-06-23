const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User.model');
const googleSheetsService = require('./services/google-sheets.service');

async function run() {
    try {
        console.log('⏳ Connecting to Database (Belgium Cluster)...');
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 60000,
            socketTimeoutMS: 60000,
            connectTimeoutMS: 60000,
            family: 4
        });
        console.log('✅ Connected.');

        console.log('📡 Fetching all users...');
        const users = await User.find({}).lean();
        console.log(`📊 Found ${users.length} users.`);

        if (users.length === 0) {
            console.warn('⚠️ No users found to sync.');
            process.exit(0);
        }

        console.log('🚀 Triggering Google Sheets User Sync (Full Map)...');
        const success = await googleSheetsService.syncUsers(users);
        
        if (success) {
            console.log('✨ Success! ALL existing customers are now backed up in the "العملاء" tab.');
        } else {
            console.error('❌ Sync failed. Check the logs above.');
        }
        process.exit(0);
    } catch (e) {
        console.error('❌ Fatal Error:', e);
        process.exit(1);
    }
}
run();
