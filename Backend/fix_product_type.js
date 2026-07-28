/**
 * Fix productType for existing products that don't have it set
 * This will enable the "Publish to Amazon" button for existing products
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

    // First, let's check what productTypes exist
    const typeStats = await collection.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$productType', count: { $sum: 1 } } }
    ]).toArray();
    
    console.log('📊 Current productType distribution:');
    typeStats.forEach(stat => {
      console.log(`  - ${stat._id || 'undefined/null'}: ${stat.count} products`);
    });

    // Find products without productType or with null/undefined productType
    const result = await collection.updateMany(
      { 
        productType: { $exists: false },
        status: 'approved'
      },
      { 
        $set: { productType: 'physical' }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} products to have productType: 'physical'`);

    // Also update products that have productType set to null
    const nullResult = await collection.updateMany(
      { 
        productType: null,
        status: 'approved'
      },
      { 
        $set: { productType: 'physical' }
      }
    );

    console.log(`✅ Updated ${nullResult.modifiedCount} products that had productType: null`);

    // Also update products that have productType set to empty string
    const emptyResult = await collection.updateMany(
      { 
        productType: '',
        status: 'approved'
      },
      { 
        $set: { productType: 'physical' }
      }
    );

    console.log(`✅ Updated ${emptyResult.modifiedCount} products that had productType: ''`);

    // Update ALL approved products to ensure they have productType: 'physical'
    // This is a safety measure to ensure all products can be published to Amazon
    const allResult = await collection.updateMany(
      { 
        status: 'approved',
        productType: { $ne: 'physical' }
      },
      { 
        $set: { productType: 'physical' }
      }
    );

    console.log(`✅ Updated ${allResult.modifiedCount} additional products to have productType: 'physical'`);

    await mongoose.disconnect();
    console.log('🎉 All done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
