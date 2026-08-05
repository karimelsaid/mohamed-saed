require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');
const { generateAmazonAffiliateLink, extractAsin } = require('./utils/amazonAffiliate');
const affiliateRoutes = require('./routes/affiliate.routes');
const ordersRoutes = require('./routes/orders.routes');
const Product = require('./models/Product.model');
const { connectDB } = require('./config/database');

async function runComplianceTests() {
  console.log('====================================================');
  console.log('🧪 AMAZON AFFILIATE COMPLIANCE & SAFEGUARD TEST SUITE');
  console.log('====================================================\n');

  // Connect to DB using established configuration
  await connectDB();

  // Test 1: ASIN Extraction & Link Generation
  console.log('▶ [TEST 1] ASIN Extraction & Affiliate Link Generation');
  const asin1 = extractAsin('B08XW2K1J8');
  const asin2 = extractAsin('https://www.amazon.eg/dp/B08XW2K1J8/ref=sr_1_1');
  const link = generateAmazonAffiliateLink('B08XW2K1J8');

  console.log('   - Extract ASIN from String:', asin1);
  console.log('   - Extract ASIN from URL:', asin2);
  console.log('   - Generated Link:', link);

  const t1Passed = asin1 === 'B08XW2K1J8' && 
                   asin2 === 'B08XW2K1J8' && 
                   link === 'https://www.amazon.eg/dp/B08XW2K1J8/?tag=knoozbook-21';

  console.log('   - STATUS:', t1Passed ? '✅ PASSED' : '❌ FAILED');
  console.log('----------------------------------------------------\n');

  // Set up Express app for HTTP API testing
  const app = express();
  app.use(express.json());
  app.use('/api/affiliate', affiliateRoutes);
  app.use('/api/orders', ordersRoutes);

  // Test 2: Affiliate Link API Track Endpoint
  console.log('▶ [TEST 2] Click Tracking API Endpoint');
  const trackRes = await request(app)
    .post('/api/affiliate/track-click')
    .send({
      amazonAsin: 'B08XW2K1J8',
      sellerId: 'merchant_test_123',
      productId: new mongoose.Types.ObjectId().toString()
    });

  const t2Passed = trackRes.status === 200 && trackRes.body.success && trackRes.body.affiliateUrl.includes('knoozbook-21');
  console.log('   - HTTP Status:', trackRes.status);
  console.log('   - Event ID:', trackRes.body.eventId);
  console.log('   - Generated Tracked URL:', trackRes.body.affiliateUrl);
  console.log('   - STATUS:', t2Passed ? '✅ PASSED' : '❌ FAILED');
  console.log('----------------------------------------------------\n');

  // Test 3: CRITICAL COMPLIANCE TEST — Block On-Site Checkout for Affiliate Products
  console.log('▶ [TEST 3] CRITICAL COMPLIANCE SAFEGUARD: Block On-Site Checkout for Affiliate Products');
  
  // Create dummy affiliate product in DB
  const dummyProd = await Product.create({
    product_name: 'كتاب أفلييت تجريبي للامتثال',
    product_quantity: 10,
    product_category: 'كتب',
    product_description: 'وصف تجريبي للامتثال',
    product_price: 150,
    price_cost: 100,
    weight: 0.5,
    language: 'none',
    merchantId: new mongoose.Types.ObjectId(),
    productType: 'affiliate',
    amazonAsin: 'B08XW2K1J8'
  });

  const dummyUserId = new mongoose.Types.ObjectId();
  const checkoutRes = await request(app)
    .post('/api/orders/submit')
    .send({
      userId: dummyUserId.toString(),
      totalAmount: 150,
      products: [
        {
          bookId: dummyProd._id.toString(),
          bookName: 'كتاب أفلييت تجريبي للامتثال',
          quantity: 1,
          price: 150
        }
      ]
    });

  // Clean up dummy test product
  await Product.findByIdAndDelete(dummyProd._id);

  const isCheckoutBlocked = checkoutRes.status === 400 && 
                            checkoutRes.body.code === 'AFFILIATE_CHECKOUT_BLOCKED';

  console.log('   - HTTP Status:', checkoutRes.status);
  console.log('   - Error Code:', checkoutRes.body.code);
  console.log('   - Error Message:', checkoutRes.body.message);
  console.log('   - STATUS:', isCheckoutBlocked ? '✅ PASSED (On-site checkout successfully blocked!)' : '❌ FAILED');
  console.log('----------------------------------------------------\n');

  if (t1Passed && t2Passed && isCheckoutBlocked) {
    console.log('====================================================');
    console.log('🎉 ALL COMPLIANCE AND SAFEGUARD UNIT TESTS PASSED 100% SUCCESSFULLY!');
    console.log('====================================================');
  } else {
    console.error('❌ COMPLIANCE VERIFICATION FAILED');
    process.exit(1);
  }

  await mongoose.disconnect();
  process.exit(0);
}

runComplianceTests().catch(err => {
  console.error('❌ Test suite execution error:', err);
  process.exit(1);
});
