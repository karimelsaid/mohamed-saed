const mongoose = require('mongoose');
const Product = require('./models/Product.model');
const SystemSettings = require('./models/SystemSettings.js');
const http = require('https');

// MongoDB connection - use environment variable or production URI
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/knoozbook';
const API_BASE_URL = 'https://knoozbook.com/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'YOUR_ADMIN_TOKEN'; // Need to provide this

async function runTest() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Step 1: Select a suitable product for testing
    console.log('\n📋 Step 1: Selecting a suitable product for testing...');
    const products = await Product.find({
      status: 'approved',
      productType: 'physical',
      amazonStatus: { $in: ['pending', 'failed'] },
      images: { $exists: true, $ne: [] },
      product_price: { $gt: 0 },
      product_quantity: { $gt: 0 }
    }).limit(10);

    if (products.length === 0) {
      console.log('❌ No suitable products found. Looking for any approved physical products...');
      const allProducts = await Product.find({
        status: 'approved',
        productType: 'physical'
      }).limit(5);
      console.log('Available approved physical products:');
      allProducts.forEach(p => {
        console.log(`- ID: ${p._id}`);
        console.log(`  Name: ${p.product_name}`);
        console.log(`  Price: ${p.product_price}`);
        console.log(`  Quantity: ${p.product_quantity}`);
        console.log(`  Images: ${p.images?.length || 0}`);
        console.log(`  Amazon Status: ${p.amazonStatus}`);
        console.log(`  Dimensions: ${p.length}x${p.width}x${p.height}, Weight: ${p.weight}`);
        console.log('');
      });
      if (allProducts.length === 0) {
        console.log('❌ No approved physical products found at all.');
        process.exit(1);
      }
    }

    const testProduct = products[0] || allProducts[0];
    console.log('✅ Selected product:');
    console.log(`   ID: ${testProduct._id}`);
    console.log(`   Name: ${testProduct.product_name}`);
    console.log(`   Price: ${testProduct.product_price}`);
    console.log(`   Quantity: ${testProduct.product_quantity}`);
    console.log(`   Images: ${testProduct.images?.length || 0}`);
    console.log(`   Dimensions: ${testProduct.length}x${testProduct.width}x${testProduct.height}, Weight: ${testProduct.weight}`);
    console.log(`   Amazon Status: ${testProduct.amazonStatus}`);

    // Step 2: Verify product has all required data
    console.log('\n📋 Step 2: Verifying product data completeness...');
    const requiredFields = {
      product_name: testProduct.product_name,
      product_description: testProduct.product_description,
      product_price: testProduct.product_price,
      product_quantity: testProduct.product_quantity,
      product_category: testProduct.product_category,
      images: testProduct.images,
      weight: testProduct.weight,
      length: testProduct.length,
      width: testProduct.width,
      height: testProduct.height,
      publisher: testProduct.publisher,
      author: testProduct.author
    };

    let missingFields = [];
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || (Array.isArray(value) && value.length === 0)) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      console.log('⚠️  Missing required fields:', missingFields);
    } else {
      console.log('✅ All required fields present');
    }

    // Step 3: Check System Settings for Amazon price percentage
    console.log('\n📋 Step 3: Checking System Settings...');
    const settings = await SystemSettings.getInstance();
    const amazonSettings = settings.amazon || {};
    const priceIncreasePercentage = amazonSettings.priceIncreasePercentage || 20;
    const calculatedAmazonPrice = Math.round(testProduct.product_price * (1 + priceIncreasePercentage / 100));
    console.log(`   Price Increase Percentage: ${priceIncreasePercentage}%`);
    console.log(`   Base Price: ${testProduct.product_price} EGP`);
    console.log(`   Calculated Amazon Price: ${calculatedAmazonPrice} EGP`);

    // Step 4: Publish product to Amazon
    console.log('\n📋 Step 4: Publishing product to Amazon...');
    console.log(`   Product ID: ${testProduct._id}`);
    console.log(`   API Endpoint: POST ${API_BASE_URL}/amazon/products/${testProduct._id}/amazon/publish`);

    if (ADMIN_TOKEN === 'YOUR_ADMIN_TOKEN') {
      console.log('\n⚠️  ADMIN_TOKEN not set. Please provide it:');
      console.log('   export ADMIN_TOKEN=your_actual_token');
      console.log('   Then run this script again.');
      process.exit(1);
    }

    const publishResponse = await makeApiRequest(
      `/amazon/products/${testProduct._id}/amazon/publish`,
      'POST',
      ADMIN_TOKEN
    );

    console.log('   Response:', JSON.stringify(publishResponse, null, 2));

    if (publishResponse.success) {
      console.log('✅ Product added to publishing queue');
      console.log(`   Job ID: ${publishResponse.jobId}`);
    } else {
      console.log('❌ Failed to publish product');
      process.exit(1);
    }

    // Step 5: Monitor workflow execution
    console.log('\n📋 Step 5: Monitoring workflow execution...');
    console.log('   This will take several minutes. Please wait...');

    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let finalStatus = 'publishing';

    while (attempts < maxAttempts && finalStatus === 'publishing') {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const updatedProduct = await Product.findById(testProduct._id);
      finalStatus = updatedProduct.amazonStatus;

      console.log(`   [${attempts}/${maxAttempts}] Status: ${finalStatus}`);
      if (updatedProduct.amazonSku) console.log(`   SKU: ${updatedProduct.amazonSku}`);
      if (updatedProduct.amazonAsin) console.log(`   ASIN: ${updatedProduct.amazonAsin}`);
      if (updatedProduct.amazonLastError) console.log(`   Error: ${updatedProduct.amazonLastError}`);
    }

    if (finalStatus === 'published') {
      console.log('✅ Product published successfully!');
      console.log(`   Amazon URL: https://www.amazon.eg/dp/${updatedProduct.amazonAsin}`);
    } else if (finalStatus === 'failed') {
      console.log('❌ Product publishing failed');
      console.log(`   Error: ${updatedProduct.amazonLastError}`);
      process.exit(1);
    } else {
      console.log('⚠️  Product still in publishing state after timeout');
      console.log(`   Current Status: ${finalStatus}`);
    }

    // Step 6: Verify product data
    console.log('\n📋 Step 6: Verifying product data...');
    console.log('   Please check the following in Amazon Seller Central:');
    console.log(`   - Title: ${testProduct.product_name}`);
    console.log(`   - Description: ${testProduct.product_description}`);
    console.log(`   - Price: ${calculatedAmazonPrice} EGP`);
    console.log(`   - Inventory: ${testProduct.product_quantity}`);
    console.log(`   - Dimensions: ${testProduct.length}x${testProduct.width}x${testProduct.height}`);
    console.log(`   - Weight: ${testProduct.weight}`);
    console.log(`   - Amazon URL: https://www.amazon.eg/dp/${updatedProduct.amazonAsin}`);

    await mongoose.disconnect();
    console.log('\n✅ Test complete');
    console.log('\n📝 Next Steps:');
    console.log('1. Verify the product appears in Amazon Seller Central');
    console.log('2. Check all product data matches expected values');
    console.log('3. Test sync functionality by modifying price/quantity/image');
    console.log('4. Test duplicate protection by attempting to publish again');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

function makeApiRequest(endpoint, method, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'knoozbook.com',
      port: 443,
      path: `/api${endpoint}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ success: false, message: 'Invalid JSON response', data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (method === 'POST') {
      req.write(JSON.stringify({}));
    }

    req.end();
  });
}

runTest();
