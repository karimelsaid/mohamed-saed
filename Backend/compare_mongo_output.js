const mongoose = require('mongoose');
require('dotenv').config({ path: '/var/www/kenouz/.env' });
const fs = require('fs');

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
    
    // Check products from دار اللؤلؤة in MongoDB
    const pearlProducts = await Product.find({ 
      $or: [
        { publisher: 'دار اللؤلؤة' },
        { publisher: /لؤلؤة/i }
      ]
    })
      .select('_id product_name barcode products_id status amazonAsin')
      .sort({ _id: -1 })
      .limit(5);
    
    console.log('📋 Comparing MongoDB vs output.json for pearl products:');
    
    // Read output.json
    let outputJson = [];
    try {
      const outputPath = '/var/www/kenouz/output.json';
      const fileContent = fs.readFileSync(outputPath, 'utf-8');
      outputJson = JSON.parse(fileContent);
    } catch (err) {
      console.error('❌ Error reading output.json:', err.message);
      return;
    }
    
    // Compare data
    pearlProducts.forEach(p => {
      const barcode = p.barcode || p.products_id;
      const outputProduct = outputJson.find(op => 
        String(op.barcode || op.products_id) === String(barcode)
      );
      
      console.log(`\n- ${p.product_name}`);
      console.log(`  barcode: ${barcode}`);
      
      if (outputProduct) {
        console.log(`  MongoDB status: ${p.status}, amazonAsin: ${p.amazonAsin || 'none'}`);
        console.log(`  output.json status: ${outputProduct.status || 'none'}, amazonAsin: ${outputProduct.amazonAsin || 'none'}`);
        
        const mongoShouldShow = !p.amazonAsin && p.status === 'approved';
        const outputShouldShow = !outputProduct.amazonAsin && outputProduct.status === 'approved';
        
        console.log(`  MongoDB should show button: ${mongoShouldShow}`);
        console.log(`  output.json should show button: ${outputShouldShow}`);
        
        if (mongoShouldShow !== outputShouldShow) {
          console.log(`  ⚠️ MISMATCH! Data is different between MongoDB and output.json`);
        }
      } else {
        console.log(`  ❌ NOT FOUND in output.json`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🎉 All done!');
  }
});
