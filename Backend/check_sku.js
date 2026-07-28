const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product.model');

async function checkProductSku() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const productId = '6a63f4ebb9606fd3ed6e8097';
    
    // Try to find by _id first
    let product = await Product.findById(productId);
    
    // If not found, try by products_id
    if (!product) {
      product = await Product.findOne({ products_id: productId });
    }

    if (!product) {
      console.log('❌ Product not found');
      return;
    }

    console.log('✅ Product found:');
    console.log('- Name:', product.product_name);
    console.log('- _id:', product._id);
    console.log('- products_id:', product.products_id);
    console.log('- amazonSku:', product.amazonSku || 'Not set');
    console.log('- amazonAsin:', product.amazonAsin || 'Not set');
    console.log('- amazonStatus:', product.amazonStatus || 'Not set');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkProductSku();
