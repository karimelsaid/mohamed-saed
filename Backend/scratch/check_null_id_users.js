const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env.MONGO_URI;

async function run() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  const db = mongoose.connection.db;
  const collection = db.collection('users');

  console.log('Checking for users with null _id...');
  const nullIdUsers = await collection.find({ _id: null }).toArray();
  console.log(`Found ${nullIdUsers.length} users with _id: null`);
  if (nullIdUsers.length > 0) {
    console.log(nullIdUsers);
  }

  console.log('Checking for all users role admin or merchant without _id filter...');
  const allMerchants = await collection.find({ role: { $in: ['merchant', 'admin'] } }).toArray();
  console.log(`Found ${allMerchants.length} raw merchants.`);
  allMerchants.forEach((m, idx) => {
    console.log(`Raw Merchant ${idx}:`, m._id, m.role, m.name || m.username);
  });

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
