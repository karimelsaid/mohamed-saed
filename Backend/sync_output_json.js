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
    
    // Read output.json
    const outputPath = '/var/www/kenouz/output.json';
    const fileContent = fs.readFileSync(outputPath, 'utf-8');
    let outputJson = JSON.parse(fileContent);
    
    console.log(`📄 output.json loaded: ${outputJson.length} products`);
    
    // Get all products from MongoDB
    const mongoProducts = await Product.find({}).select('products_id barcode status amazonAsin').lean();
    console.log(`📊 MongoDB products: ${mongoProducts.length}`);
    
    // Create a map for quick lookup
    const mongoMap = new Map();
    mongoProducts.forEach(p => {
      const key = String(p.barcode || p.products_id).trim();
      mongoMap.set(key, {
        status: p.status,
        amazonAsin: p.amazonAsin
      });
    });
    
    // Update output.json with correct status and amazonAsin
    let updatedCount = 0;
    outputJson.forEach(p => {
      const key = String(p.barcode || p.products_id).trim();
      const mongoData = mongoMap.get(key);
      
      if (mongoData) {
        if (p.status !== mongoData.status || p.amazonAsin !== mongoData.amazonAsin) {
          p.status = mongoData.status;
          p.amazonAsin = mongoData.amazonAsin;
          updatedCount++;
        }
      }
    });
    
    console.log(`🔄 Updated ${updatedCount} products in output.json`);
    
    // Write back to output.json
    fs.writeFileSync(outputPath, JSON.stringify(outputJson, null, 2));
    console.log('✅ output.json updated successfully');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🎉 All done!');
  }
});
