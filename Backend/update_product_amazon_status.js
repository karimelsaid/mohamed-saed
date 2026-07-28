const mongoose = require('mongoose');
const Product = require('./models/Product.model');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const result = await Product.findOneAndUpdate(
    { products_id: '355830657455' },
    { 
      amazonAsin: 'B0HBKQFM2C',
      amazonStatus: 'published',
      amazonSyncedAt: new Date()
    },
    { new: true }
  ).select('product_name products_id amazonStatus amazonAsin amazonSku');
  
  if (result) {
    console.log('Product updated successfully:');
    console.log(`Name: ${result.product_name}`);
    console.log(`Product ID: ${result.products_id}`);
    console.log(`Amazon Status: ${result.amazonStatus}`);
    console.log(`Amazon ASIN: ${result.amazonAsin}`);
    console.log(`Amazon SKU: ${result.amazonSku}`);
  } else {
    console.log('Product not found');
  }
  mongoose.connection.close();
}).catch(err => console.error(err));
