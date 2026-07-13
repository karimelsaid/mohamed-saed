const mongoose = require('mongoose');
const Product = require('../models/Product.model');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// MongoDB connection - use same URI as the main app
const MONGODB_URI = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function updateOutputJson() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Fetch all approved products from MongoDB
    const products = await Product.find({ status: 'approved' })
      .select({
        products_id: 1,
        product_name: 1,
        product_description: 1,
        product_category: 1,
        product_price: 1,
        product_quantity: 1,
        author: 1,
        publisher: 1,
        pages: 1,
        coverType: 1,
        language: 1,
        publishYear: 1,
        product_image: 1,
        image_path: 1,
        views: 1,
        barcode: 1,
        merchantId: 1,
        createdAt: 1
      })
      .lean();

    console.log(`Fetched ${products.length} products from MongoDB`);

    // Update output.json
    const outputPath = path.join(__dirname, '..', 'output.json');
    fs.writeFileSync(outputPath, JSON.stringify(products, null, 2));
    console.log('✅ Updated output.json');

    // Update output_full.json
    const outputFullPath = path.join(__dirname, '..', 'output_full.json');
    fs.writeFileSync(outputFullPath, JSON.stringify(products, null, 2));
    console.log('✅ Updated output_full.json');

    // Update output_raw.json
    const outputRawPath = path.join(__dirname, '..', 'output_raw.json');
    fs.writeFileSync(outputRawPath, JSON.stringify(products, null, 2));
    console.log('✅ Updated output_raw.json');

    console.log('Done! All JSON files updated with current MongoDB data.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

updateOutputJson();
