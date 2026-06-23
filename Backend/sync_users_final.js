const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User.model');
const googleSheetsService = require('./services/google-sheets.service');

async function run() {
    try {
        console.log('Connecting to Database...');
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 60000 });
        console.log('Connected.');

        const users = await User.find({}).lean();
        console.log('Found users: ' + users.length);

        if (users.length === 0) {
            console.log('No users to sync.');
            process.exit(0);
        }

        console.log('Starting Sheet Sync...');
        const success = await googleSheetsService.syncUsers(users);
        
        if (success) {
            console.log('SUCCESS: All users are now in the Customers tab.');
        } else {
            console.log('FAILED: Sync service returned failure.');
        }
        process.exit(0);
    } catch (e) {
        console.log('ERROR: ' + e.message);
        process.exit(1);
    }
}
run();
