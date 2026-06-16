const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Product = require('../models/Product.model');

const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  console.log('🔌 Connecting...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  console.log('Fetching all products...');
  const products = await Product.find({ status: 'approved' }).lean();
  console.log(`Fetched ${products.length} products. Analyzing sizes...`);

  const fieldSizes = {};
  const fieldTypes = {};

  products.forEach(p => {
    Object.keys(p).forEach(key => {
      const val = p[key];
      let size = 0;
      if (val !== null && val !== undefined) {
        size = JSON.stringify(val).length;
      }
      
      if (!fieldSizes[key]) {
        fieldSizes[key] = 0;
        fieldTypes[key] = new Set();
      }
      fieldSizes[key] += size;
      fieldTypes[key].add(typeof val);
    });
  });

  const sortedFields = Object.keys(fieldSizes).map(key => {
    return {
      field: key,
      totalSizeKB: Math.round(fieldSizes[key] / 1024),
      avgSizeByProductBytes: Math.round(fieldSizes[key] / products.length),
      types: Array.from(fieldTypes[key]).join(', ')
    };
  }).sort((a, b) => b.totalSizeKB - a.totalSizeKB);

  console.log('\n=== FIELD SIZE ANALYSIS ===');
  console.table(sortedFields);

  // Print sample values of the largest fields
  for (let i = 0; i < Math.min(3, sortedFields.length); i++) {
    const largestField = sortedFields[i].field;
    console.log(`\nSample of largest field [${largestField}]:`);
    const samplesWithField = products.filter(p => p[largestField] !== undefined && p[largestField] !== null);
    if (samplesWithField.length > 0) {
      console.log(JSON.stringify(samplesWithField[0][largestField]).substring(0, 500) + '...');
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
