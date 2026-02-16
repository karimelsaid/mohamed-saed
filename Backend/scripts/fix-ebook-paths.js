/**
 * Fix epubFilePath in database to include uploads/ebooks/ prefix
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Ebook = require('../models/Ebook.model');

console.log('MONGO_URI:', process.env.MONGO_URI ? 'Found' : 'Not found');

async function fixPaths() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const ebooks = await Ebook.find();
        console.log(`Found ${ebooks.length} ebooks`);

        let fixedCount = 0;
        for (const ebook of ebooks) {
            if (ebook.epubFilePath && ebook.epubFilePath.indexOf('uploads/') !== 0) {
                const oldPath = ebook.epubFilePath;
                ebook.epubFilePath = 'uploads/ebooks/' + ebook.epubFilePath;
                await ebook.save();
                console.log(`Fixed: ${ebook.title}`);
                console.log(`  From: ${oldPath}`);
                console.log(`  To: ${ebook.epubFilePath}`);
                fixedCount++;
            }
        }

        console.log(`\nDone! Fixed ${fixedCount} ebooks.`);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixPaths();
