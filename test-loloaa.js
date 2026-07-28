require('dotenv').config({path: './Backend/.env'});
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const Product = require('./Backend/models/Product.model.js');
    const products = await Product.find({ publisher: /اللؤلؤة/ }).limit(3);
    console.log("Found products:", products.length);
    products.forEach(p => {
      console.log({
        title: p.product_name,
        publisher: p.publisher,
        image_path: p.image_path,
        product_image: p.product_image,
        barcode: p.barcode,
        merchantName: p.merchantName,
        adminName: p.adminName,
        merchantRole: p.merchantRole
      });
    });
    process.exit(0);
  })
  .catch(err => { console.error(err); process.exit(1); });
