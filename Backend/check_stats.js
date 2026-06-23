const mongoose = require('mongoose');
const Product = require('./models/Product.model');
require('dotenv').config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const stats = await Product.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    console.log('STATS_STATUS:', JSON.stringify(stats, null, 2));
    
    const merchantStats = await Product.aggregate([
      { $group: { _id: { hasMerchant: { $exists: ['$merchantId', true] }, merchantId: '$merchantId' }, count: { $sum: 1 } } }
    ]);
     // Simpler check
    const nullMerchants = await Product.countDocuments({ merchantId: null });
    const emptyMerchants = await Product.countDocuments({ merchantId: '' });
    const missingMerchants = await Product.countDocuments({ merchantId: { $exists: false } });
    
    console.log('Merchant Stats:');
    console.log('- Null:', nullMerchants);
    console.log('- Empty:', emptyMerchants);
    console.log('- Missing:', missingMerchants);
    
    const approvedAdmin = await Product.find({ status: 'approved', merchantId: null }).limit(1).lean();
    console.log('SAMPLE_APPROVED_ADMIN:', JSON.stringify(approvedAdmin, null, 2));

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
run();
