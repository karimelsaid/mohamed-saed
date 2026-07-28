const mongoose = require('mongoose');
const Product = require('./models/Product.model');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const products = await Product.find({ products_id: { $in: ['355830657455', '515888150067'] } })
    .select('_id product_name product_price product_quantity status image_path product_image amazonStatus amazonSku amazonAsin amazonSyncedAt amazonLastError amazonRetryCount');
  
  console.log('Products found:');
  products.forEach(p => {
    console.log(`Name: ${p.product_name}`);
    console.log(`Product ID: ${p.products_id || 'N/A'}`);
    console.log(`Status: ${p.status}`);
    console.log(`Amazon Status: ${p.amazonStatus}`);
    console.log(`Amazon SKU: ${p.amazonSku}`);
    console.log(`Amazon ASIN: ${p.amazonAsin}`);
    console.log('---');
  });
  mongoose.connection.close();
}).catch(err => console.error(err));
