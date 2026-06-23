const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  console.log('🔌 Connecting...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  const db = mongoose.connection.db;
  const collection = db.collection('products');

  // Test 1: Default batch size
  console.log('\n1. Testing with default batch size...');
  const t1 = Date.now();
  const res1 = await collection.find({ status: 'approved' }).toArray();
  console.log(`Default batch size: fetched ${res1.length} items in ${Date.now() - t1}ms`);

  // Test 2: Batch size 1000
  console.log('\n2. Testing with batchSize(1000)...');
  const t2 = Date.now();
  const res2 = await collection.find({ status: 'approved' }).batchSize(1000).toArray();
  console.log(`batchSize(1000): fetched ${res2.length} items in ${Date.now() - t2}ms`);

  // Test 3: Batch size 5000
  console.log('\n3. Testing with batchSize(5000)...');
  const t3 = Date.now();
  const res3 = await collection.find({ status: 'approved' }).batchSize(5000).toArray();
  console.log(`batchSize(5000): fetched ${res3.length} items in ${Date.now() - t3}ms`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
