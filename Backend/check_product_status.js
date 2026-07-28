const mongoose = require('mongoose');
const Product = require('./models/Product.model');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const product = await Product.findOne({ products_id: '515888150067' }).select('product_name products_id amazonStatus amazonAsin amazonSku');
  
  if (product) {
    console.log('Product found:');
    console.log(`Name: ${product.product_name}`);
    console.log(`Product ID: ${product.products_id}`);
    console.log(`Amazon Status: ${product.amazonStatus}`);
    console.log(`Amazon ASIN: ${product.amazonAsin}`);
    console.log(`Amazon SKU: ${product.amazonSku}`);
  } else {
    console.log('Product not found');
  }
  mongoose.connection.close();
}).catch(err => console.error(err));
