const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product.model');

async function checkRecentPublish() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find products with recent amazonStatus changes
    const products = await Product.find({
      $or: [
        { amazonStatus: { $ne: null } },
        { amazonSku: { $ne: null } },
        { amazonAsin: { $ne: null } }
      ]
    }).sort({ updatedAt: -1 }).limit(10);

    console.log(`\n📦 Found ${products.length} products with Amazon data:\n`);

    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.product_name}`);
      console.log(`   - products_id: ${product.products_id}`);
      console.log(`   - amazonStatus: ${product.amazonStatus || 'Not set'}`);
      console.log(`   - amazonSku: ${product.amazonSku || 'Not set'}`);
      console.log(`   - amazonAsin: ${product.amazonAsin || 'Not set'}`);
      console.log(`   - amazonSubmissionId: ${product.amazonSubmissionId || 'Not set'}`);
      console.log(`   - updatedAt: ${product.updatedAt}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkRecentPublish();
