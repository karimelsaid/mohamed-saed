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

  console.log('\n1. Testing raw mongodb find count...');
  const countStart = Date.now();
  const count = await collection.countDocuments({ status: 'approved' });
  console.log(`Count: ${count} in ${Date.now() - countStart}ms`);

  console.log('\n2. Testing raw mongodb find with projection (only _id, status)...');
  const rawMinStart = Date.now();
  const minProducts = await collection.find({ status: 'approved' }).project({ _id: 1, status: 1 }).toArray();
  console.log(`Fetched ${minProducts.length} items in ${Date.now() - rawMinStart}ms`);

  console.log('\n3. Testing raw mongodb find all fields...');
  const rawStart = Date.now();
  const products = await collection.find({ status: 'approved' }).toArray();
  console.log(`Fetched ${products.length} items in ${Date.now() - rawStart}ms`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
