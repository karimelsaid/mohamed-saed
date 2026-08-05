require('dotenv').config();
const { generateAmazonAffiliateLink, extractAsin } = require('./utils/amazonAffiliate');
const affiliateController = require('./controllers/affiliate.controller');

function runUnitTests() {
  console.log('🧪 Starting Amazon Affiliate Integration Logic Unit Tests...');

  // Test 1: ASIN Extraction
  const asin1 = extractAsin('B08XW2K1J8');
  console.log('Test 1 (ASIN String):', asin1 === 'B08XW2K1J8' ? '✅ PASS' : '❌ FAIL');

  const asin2 = extractAsin('https://www.amazon.eg/dp/B08XW2K1J8/ref=sr_1_1');
  console.log('Test 2 (Amazon URL):', asin2 === 'B08XW2K1J8' ? '✅ PASS' : '❌ FAIL');

  // Test 2: Affiliate Link Generation
  const link = generateAmazonAffiliateLink('B08XW2K1J8');
  console.log('Generated Link:', link);
  const isLinkValid = link === 'https://www.amazon.eg/dp/B08XW2K1J8/?tag=knoozbook-21';
  console.log('Test 3 (Store Tag knoozbook-21):', isLinkValid ? '✅ PASS' : '❌ FAIL');

  if (asin1 === 'B08XW2K1J8' && asin2 === 'B08XW2K1J8' && isLinkValid) {
    console.log('🎉 ALL UNIT TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME TESTS FAILED');
    process.exit(1);
  }
}

runUnitTests();
