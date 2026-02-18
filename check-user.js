const mongoose = require('mongoose');
const User = require('./Backend/models/User.model.js');
require('dotenv').config({ path: './Backend/.env' });

const emailToCheck = process.argv[2];

if (!emailToCheck) {
    console.log("Usage: node check-user.js <email>");
    process.exit(1);
}

// Ensure URI is correct
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz";

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log(`Checking DB: ${MONGO_URI.split('@')[1].split('/')[0]}`); // Log host only for safety
        console.log(`Searching for email: '${emailToCheck}'`);

        // Exact match
        const user = await User.findOne({ email: emailToCheck });
        if (user) {
            console.log("✅ User found (Exact match)!");
            console.log("ID:", user._id);
            console.log("Email:", user.email);
            console.log("Username:", user.username);
        } else {
            console.log("❌ User NOT found (Exact match).");

            // Fuzzy search (case insensitive)
            const fuzzyUser = await User.findOne({ email: { $regex: new RegExp(`^${emailToCheck}$`, 'i') } });
            if (fuzzyUser) {
                console.log(`⚠️  User found with CASE DIFFERENCE: '${fuzzyUser.email}'`);
            } else {
                console.log("❌ User NOT found with case-insensitive search either.");
            }
        }
        await mongoose.disconnect();
    })
    .catch(err => {
        console.error("Connection error:", err);
        process.exit(1);
    });
