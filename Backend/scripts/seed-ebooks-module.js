/**
 * Module to seed test ebooks into the database
 * Can be imported and used in app.js
 */

const fs = require('fs');
const path = require('path');
const Ebook = require('../models/Ebook.model');

async function seedEbooks() {
    try {
        const ebooksDir = path.join(__dirname, '../uploads/ebooks');

        // Ensure directory exists
        if (!fs.existsSync(ebooksDir)) {
            console.log('📂 Creating ebooks directory...');
            fs.mkdirSync(ebooksDir, { recursive: true });
        }

        // Fix existing ebook paths that don't have uploads/ebooks prefix
        const existingEbooks = await Ebook.find();
        for (const ebook of existingEbooks) {
            if (ebook.epubFilePath && !ebook.epubFilePath.startsWith('uploads/')) {
                const oldPath = ebook.epubFilePath;
                ebook.epubFilePath = 'uploads/ebooks/' + ebook.epubFilePath;
                await ebook.save();
                console.log(`🔧 Fixed path for: ${ebook.title}`);
            }
        }


        // Read files from directory
        const files = fs.readdirSync(ebooksDir);
        const epubFiles = files.filter(file => file.toLowerCase().endsWith('.epub'));

        if (epubFiles.length === 0) {
            console.log('ℹ️ No .epub files found in uploads/ebooks directory.');
            return;
        }

        console.log(`📚 Found ${epubFiles.length} .epub files in directory.`);

        let addedCount = 0;

        for (const file of epubFiles) {
            // Check if ebook already exists in DB by file path (with full path)
            const fullPath = `uploads/ebooks/${file}`;
            const existingEbook = await Ebook.findOne({ epubFilePath: fullPath });

            if (!existingEbook) {
                // Extract title from filename (remove extension)
                const title = file.replace('.epub', '').replace(/-/g, ' ').trim();

                // Get file stats
                const stats = fs.statSync(path.join(ebooksDir, file));

                const newEbook = {
                    title: title,
                    author: 'غير معروف', // Default author
                    description: 'تمت إضافته تلقائياً من المجلد',
                    coverImage: 'https://via.placeholder.com/300x400?text=Ebook', // Default cover
                    epubFilePath: `uploads/ebooks/${file}`,
                    fileSize: stats.size,
                    category: 'Novels-stories', // Default category
                    language: 'العربية',
                    publisher: 'knoozbook',
                    publishYear: new Date().getFullYear(),
                    pages: 0,
                    price: 0, // Free by default or set a price
                    availableForSubscription: true,
                    status: 'active'
                };

                await Ebook.create(newEbook);
                console.log(`✅ Added new ebook: ${title}`);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            console.log(`🎉 Successfully added ${addedCount} new ebooks from files.`);
        } else {
            console.log('✨ All files are already in the database.');
        }

    } catch (error) {
        console.error('❌ Error syncing ebooks:', error);
    }
}

module.exports = seedEbooks;
