const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/Product.model');

async function checkPublishers() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz");
    console.log('Connected to MongoDB');
    
    // Find products with non-empty publisher
    const publisherProducts = await Product.find({
      publisher: { $exists: true, $ne: '' }
    });
    
    console.log(`Total products with a publisher: ${publisherProducts.length}`);
    if (publisherProducts.length > 0) {
      console.log('Sample publisher products:');
      publisherProducts.slice(0, 5).forEach(p => {
        console.log(`Name: ${p.product_name} | Publisher: ${p.publisher} | Price: ${p.product_price} | Cost: ${p.price_cost}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPublishers();
