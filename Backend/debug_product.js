const mongoose = require('mongoose');
const Product = require('./models/Product.model');
require('dotenv').config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const sample = await Product.findOne({ status: 'approved' }).lean();
    console.log('SAMPLE_START');
    console.log(JSON.stringify(sample, null, 2));
    console.log('SAMPLE_END');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
run();
