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
    
    // Check products from دار اللؤلؤة
    const pearlProducts = await Product.find({ 
      $or: [
        { publisher: 'دار اللؤلؤة' },
        { publisher: /لؤلؤة/i }
      ]
    })
      .select('_id product_name product_price status amazonStatus amazonAsin productType publisher')
      .sort({ _id: -1 })
      .limit(20);
    
    console.log('📋 Products from دار اللؤلؤة:');
    if (pearlProducts.length === 0) {
      console.log('❌ No products found from دار اللؤلؤة');
    } else {
      pearlProducts.forEach(p => {
        const hasAmazonStatus = !!p.amazonStatus;
        const hasAmazonAsin = !!p.amazonAsin;
        const isApproved = p.status === 'approved';
        const shouldShowButton = !p.amazonAsin && p.status === 'approved';
        
        console.log(`- ${p.product_name}`);
        console.log(`  publisher: ${p.publisher || 'none'}`);
        console.log(`  status: ${p.status}, amazonStatus: ${p.amazonStatus || 'none'}, amazonAsin: ${p.amazonAsin || 'none'}`);
        console.log(`  should show button: ${shouldShowButton}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🎉 All done!');
  }
});
