const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product.model');
const AmazonListingService = require('./services/amazon/amazon-listing.service');

async function checkAsin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const sku = 'WG-YT6A-2EHA';
    
    console.log(`\n🔍 Checking Amazon for SKU: ${sku}`);
    
    const listingResult = await AmazonListingService.getListing(sku);
    
    console.log('\n📦 Amazon Listing Result:');
    console.log('- Success:', listingResult.success);
    console.log('- Error:', listingResult.error || 'None');
    
    if (listingResult.success && listingResult.data) {
      const summaries = listingResult.data.summaries || [];
      console.log('- Number of summaries:', summaries.length);
      
      if (summaries.length > 0) {
        console.log('\n📋 Summaries:');
        summaries.forEach((summary, index) => {
          console.log(`  ${index + 1}. ASIN: ${summary.asin || 'Not set'}`);
          console.log(`     Status: ${summary.status || 'Unknown'}`);
          console.log(`     ConditionType: ${summary.conditionType || 'Unknown'}`);
        });
      }
      
      const issues = listingResult.data.issues || [];
      if (issues.length > 0) {
        console.log('\n⚠️ Issues:');
        issues.forEach((issue, index) => {
          console.log(`  ${index + 1}. ${issue.severity}: ${issue.message}`);
          if (issue.attributeName) {
            console.log(`     Attribute: ${issue.attributeName}`);
          }
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkAsin();
