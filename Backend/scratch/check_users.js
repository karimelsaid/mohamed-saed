const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User.model');

const uri = process.env.MONGO_URI;

async function run() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  const merchants = await User.find({ role: { $in: ['merchant', 'admin'] } })
    .select('_id name merchantName logo role merchantShippingMethod')
    .lean();
    
  console.log(`Found ${merchants.length} users with role merchant or admin.`);
  merchants.forEach((m, idx) => {
    console.log(`User ${idx}:`, m);
  });

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
