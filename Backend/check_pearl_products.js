/**
 * Check products from دار اللؤلؤة
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('products');

    const products = await collection.find({ publisher: /لؤلؤة/i }).sort({ createdAt: -1 }).limit(10).toArray();
    console.log('📋 Products from دار اللؤلؤة:');
    products.forEach(p => {
      console.log(`- ${p.product_name}: status=${p.status}, amazonAsin=${p.amazonAsin || 'none'}, productType=${p.productType || 'none'}`);
    });

    await mongoose.disconnect();
    console.log('\n🎉 All done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
