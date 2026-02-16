/**
 * Delete test ebooks from database (those with placeholder covers)
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Ebook = require('../models/Ebook.model');

async function deleteTestEbooks() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find test ebooks (with placeholder covers)
        const testEbooks = await Ebook.find({
            coverImage: { $regex: /via\.placeholder|300x400\?text=/ }
        });

        console.log(`Found ${testEbooks.length} test ebooks:`);
        testEbooks.forEach(e => console.log(`  - ${e.title}`));

        if (testEbooks.length > 0) {
            // Delete them
            const result = await Ebook.deleteMany({
                coverImage: { $regex: /via\.placeholder|300x400\?text=/ }
            });
            console.log(`\n✅ Deleted ${result.deletedCount} test ebooks!`);
        } else {
            console.log('No test ebooks found.');
        }

        // Show remaining ebooks
        const remaining = await Ebook.find();
        console.log(`\nRemaining ebooks: ${remaining.length}`);
        remaining.forEach(e => console.log(`  - ${e.title}`));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

deleteTestEbooks();
