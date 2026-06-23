const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Ebook = require('../models/Ebook.model');

async function run() {
    try {
        console.log('Connecting to:', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const totalEbooks = await Ebook.countDocuments();
        console.log(`\nTotal Ebooks in DB: ${totalEbooks}`);

        const outputPath = path.join(__dirname, '../output.json');
        const rawPath = path.join(__dirname, '../output_raw.json');
        const mappingsPath = path.join(__dirname, '../ebook-mappings.json');

        console.log(`\n--- Local File Paths ---`);
        console.log(`output.json exists: ${fs.existsSync(outputPath)}`);
        console.log(`output_raw.json exists: ${fs.existsSync(rawPath)}`);
        console.log(`ebook-mappings.json exists: ${fs.existsSync(mappingsPath)}`);

        if (fs.existsSync(outputPath)) {
            const products = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
            console.log(`\nTotal Products in output.json: ${products.length}`);
            
            const digitalProds = products.filter(p => p.is_digital === true || p.is_digital === 'true' || p.epubFilePath);
            console.log(`Digital/EPUB Products in output.json: ${digitalProds.length}`);

            const productsWithLinkedId = products.filter(p => p.linkedEbookId);
            console.log(`Products in output.json with linkedEbookId field: ${productsWithLinkedId.length}`);
            productsWithLinkedId.slice(0, 10).forEach(p => {
                console.log(`  - "${p.product_name}" | ID: "${p.products_id}" | linkedEbookId: "${p.linkedEbookId}"`);
            });
        }

        if (fs.existsSync(mappingsPath)) {
            const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf-8'));
            const keys = Object.keys(mappings);
            console.log(`\nMappings count in ebook-mappings.json: ${keys.length}`);
            console.log('Sample mappings (first 10):');
            keys.slice(0, 10).forEach(k => {
                console.log(`  - Barcode/ID: "${k}" -> EbookID: "${mappings[k]}"`);
            });
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
