const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Product = require('../models/Product.model');

const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  console.log('🔌 Connecting...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  // Test 1: Count
  console.log('\nTesting Count...');
  const countStart = Date.now();
  const count = await Product.countDocuments({ status: 'approved' });
  console.log(`Count: ${count} in ${Date.now() - countStart}ms`);

  // Test 2: Find with projection (only _id and status)
  console.log('\nTesting Find with minimal projection (only _id, status)...');
  const projMinStart = Date.now();
  const minProducts = await Product.find({ status: 'approved' }).select('_id status').lean();
  console.log(`Fetched ${minProducts.length} items in ${Date.now() - projMinStart}ms`);

  // Test 3: Find with typical fields needed by the app
  console.log('\nTesting Find with typical fields needed by unifyAndEnrichData...');
  const projFields = 'products_id product_name product_quantity product_category product_description product_price price_cost product_image product_price_before_discount rival product_discount_percent promotionEndDate status updateRequest merchantId barcode createdAt weight productType linkedEbookId epubFilePath miniEpubFilePath digitalDelivery lastStockUpdate copyType condition images publisher author pages coverType language publishYear image_path categoryPrefix views';
  const projStart = Date.now();
  const typicalProducts = await Product.find({ status: 'approved' }).select(projFields).lean();
  console.log(`Fetched ${typicalProducts.length} items in ${Date.now() - projStart}ms`);

  // Test 4: Find all fields (no projection)
  console.log('\nTesting Find all fields...');
  const fullStart = Date.now();
  const fullProducts = await Product.find({ status: 'approved' }).lean();
  console.log(`Fetched ${fullProducts.length} items in ${Date.now() - fullStart}ms`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
