const mongoose = require('mongoose');
const Product = require('./models/Product.model');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const publishedProducts = await Product.find({ 
    amazonStatus: 'published', 
    amazonAsin: { $ne: null, $ne: '' } 
  }).select('products_id product_name amazonAsin amazonStatus').limit(5);
  
  console.log('منتجات منشورة على أمازون:');
  if (publishedProducts.length === 0) {
    console.log('لا توجد منتجات منشورة على أمازون');
  } else {
    publishedProducts.forEach(p => {
      console.log(`Name: ${p.product_name}, ASIN: ${p.amazonAsin}, Status: ${p.amazonStatus}`);
    });
  }
  mongoose.connection.close();
}).catch(err => console.error(err));
