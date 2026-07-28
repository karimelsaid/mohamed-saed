const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kenouz', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
  console.log('✅ Connected to MongoDB');

  try {
    const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }), 'products');
    
    // Check the specific product
    const barcode = '089031346018';
    const product = await Product.findOne({ barcode: barcode });
    
    if (product) {
      console.log('📋 Product Details:');
      console.log(`- Name: ${product.product_name}`);
      console.log(`- Barcode: ${product.barcode}`);
      console.log(`- Status: ${product.status}`);
      console.log(`- Amazon ASIN: ${product.amazonAsin || 'none'}`);
      console.log(`- Amazon Status: ${product.amazonStatus || 'none'}`);
      console.log(`- Product Type: ${product.productType || 'none'}`);
      console.log(`- Price: ${product.product_price}`);
      console.log(`- Amazon Price: ${product.amazonPrice || 'none'}`);
      
      // Check if button should appear
      const shouldShowButton = !product.amazonAsin && product.status === 'approved';
      console.log(`\n🔍 Should show Amazon button: ${shouldShowButton}`);
      console.log(`   - !amazonAsin: ${!product.amazonAsin}`);
      console.log(`   - status === 'approved': ${product.status === 'approved'}`);
    } else {
      console.log('❌ Product not found with barcode:', barcode);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🎉 All done!');
  }
});
