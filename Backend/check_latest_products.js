const mongoose = require('mongoose');
require('dotenv').config({ path: '/var/www/kenouz/.env' });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/kenouz', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
  console.log('✅ Connected to MongoDB');

  try {
    const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }), 'products');
    
    // Get latest products (no filter)
    const allProducts = await Product.find({})
      .select('_id product_name product_price status amazonStatus amazonAsin productType')
      .sort({ _id: -1 })
      .limit(20);
    
    console.log('📋 Latest 20 products:');
    allProducts.forEach(p => {
      const hasAmazonStatus = !!p.amazonStatus;
      const hasAmazonAsin = !!p.amazonAsin;
      const isApproved = p.status === 'approved';
      const shouldShowButton = !p.amazonAsin && p.status === 'approved';
      
      console.log(`- ${p.product_name}`);
      console.log(`  status: ${p.status}, amazonStatus: ${p.amazonStatus || 'none'}, amazonAsin: ${p.amazonAsin || 'none'}`);
      console.log(`  should show button: ${shouldShowButton}`);
      console.log('');
    });
    
    // Count products with/without amazonStatus
    const withStatus = await Product.countDocuments({ amazonStatus: { $exists: true, $ne: null } });
    const withoutStatus = await Product.countDocuments({ $or: [{ amazonStatus: { $exists: false } }, { amazonStatus: null }] });
    
    console.log(`\n📊 Statistics:`);
    console.log(`- Products with amazonStatus: ${withStatus}`);
    console.log(`- Products without amazonStatus: ${withoutStatus}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🎉 All done!');
  }
});
