const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const uri = process.env.MONGO_URI || "mongodb+srv://kenouz_user:nuwRkmwJospZXapy@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function fixIndexes() {
  try {
    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Drop all indexes from products collection
    console.log('🗑️ Dropping indexes from products collection...');
    try {
      await db.collection('products').dropIndexes();
      console.log('✅ Products indexes dropped');
    } catch (e) {
      console.log('⚠️ Products indexes drop failed (may not exist):', e.message);
    }

    // Drop all indexes from ebooks collection
    console.log('🗑️ Dropping indexes from ebooks collection...');
    try {
      await db.collection('ebooks').dropIndexes();
      console.log('✅ Ebooks indexes dropped');
    } catch (e) {
      console.log('⚠️ Ebooks indexes drop failed (may not exist):', e.message);
    }

    // Recreate basic indexes without text indexes
    console.log('📝 Recreating basic indexes for products...');
    await db.collection('products').createIndex({ merchantId: 1 });
    await db.collection('products').createIndex({ barcode: 1 });
    await db.collection('products').createIndex({ products_id: 1 });
    await db.collection('products').createIndex({ amazonSku: 1 });
    console.log('✅ Products basic indexes recreated');

    console.log('📝 Recreating basic indexes for ebooks...');
    await db.collection('ebooks').createIndex({ category: 1 });
    await db.collection('ebooks').createIndex({ status: 1 });
    console.log('✅ Ebooks basic indexes recreated');

    console.log('✅ All indexes fixed successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixIndexes();
