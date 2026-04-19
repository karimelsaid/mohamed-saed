const mongoose = require('mongoose');
require('dotenv').config();

// Simple Connection Test without custom DNS logic
const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function testConnection() {
  console.log('🧪 Starting Minimal Connection Test...');
  console.log('🔗 Target URI:', uri.replace(/:([^@]+)@/, ':****@')); // Hide password in logs

  try {
    const start = Date.now();
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000
    });
    const duration = Date.now() - start;
    
    console.log(`✅ SUCCESS! Connected to MongoDB in ${duration}ms`);
    
    // Test a simple find
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('📦 Collections found:', collections.length);
    
    await mongoose.disconnect();
    console.log('👋 Disconnected. Test Complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ CONNECTION FAILED!');
    console.error('   Type:', err.name);
    console.error('   Message:', err.message);
    
    if (err.message.includes('timeout')) {
      console.log('\n💡 DIAGNOSIS: This is likely a Network/Firewall issue.');
      console.log('   - Check if your IP is whitelisted in MongoDB Atlas.');
      console.log('   - Check if your ISP is blocking port 27017.');
    }
    
    process.exit(1);
  }
}

testConnection();
