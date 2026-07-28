/**
 * Check Amazon-related fields for products
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

    // Check status distribution
    const statusStats = await collection.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();
    
    console.log('📊 Status distribution:');
    statusStats.forEach(stat => {
      console.log(`  - ${stat._id || 'undefined'}: ${stat.count} products`);
    });

    // Check amazonAsin distribution
    const asinStats = await collection.aggregate([
      { $group: { _id: { $ifNull: ['$amazonAsin', 'no_asin'] }, count: { $sum: 1 } } }
    ]).toArray();
    
    console.log('\n📊 amazonAsin distribution:');
    asinStats.forEach(stat => {
      console.log(`  - ${stat._id}: ${stat.count} products`);
    });

    // Check products that should show Amazon button (approved + no amazonAsin)
    const eligibleProducts = await collection.countDocuments({
      status: 'approved',
      amazonAsin: { $exists: false }
    });
    
    console.log(`\n✅ Products eligible for Amazon button (approved + no amazonAsin): ${eligibleProducts}`);

    // Check products with amazonAsin
    const withAsin = await collection.countDocuments({
      amazonAsin: { $exists: true, $ne: null, $ne: '' }
    });
    
    console.log(`📦 Products with amazonAsin: ${withAsin}`);

    // Sample a few recent products
    console.log('\n📋 Sample of recent products:');
    const recentProducts = await collection.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ product_name: 1, status: 1, amazonAsin: 1, productType: 1, createdAt: 1 })
      .toArray();
    
    recentProducts.forEach(p => {
      console.log(`  - ${p.product_name}: status=${p.status}, amazonAsin=${p.amazonAsin || 'none'}, productType=${p.productType || 'none'}`);
    });

    await mongoose.disconnect();
    console.log('\n🎉 All done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
