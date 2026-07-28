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
      .select('_id product_name barcode products_id')
      .sort({ _id: -1 })
      .limit(20);
    
    console.log('📋 Products from دار اللؤلؤة in MongoDB:');
    console.log(`Total found: ${pearlProducts.length}`);
    
    // Read output.json
    let outputJson = [];
    try {
      const outputPath = '/var/www/kenouz/output.json';
      const fileContent = fs.readFileSync(outputPath, 'utf-8');
      outputJson = JSON.parse(fileContent);
      console.log(`\n📄 output.json loaded: ${outputJson.length} products`);
    } catch (err) {
      console.error('❌ Error reading output.json:', err.message);
    }
    
    // Check which pearl products are in output.json
    console.log('\n🔍 Checking which pearl products are in output.json:');
    pearlProducts.forEach(p => {
      const barcode = p.barcode || p.products_id;
      const inOutput = outputJson.find(op => 
        String(op.barcode || op.products_id) === String(barcode) ||
        op.product_name === p.product_name
      );
      
      console.log(`- ${p.product_name}`);
      console.log(`  barcode: ${barcode}`);
      console.log(`  in output.json: ${inOutput ? '✅ YES' : '❌ NO'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🎉 All done!');
  }
});
