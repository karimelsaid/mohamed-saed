
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../Backend/.env') });

const ProductSchema = new mongoose.Schema({
  product_category: String,
  product_name: String
}, { strict: false });

const Product = mongoose.model('Product', ProductSchema, 'products');

async function checkCategories() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const categories = await Product.aggregate([
      { $group: { _id: '$product_category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    console.log('Categories in MongoDB:');
    categories.forEach(c => {
      console.log(`${c._id}: ${c.count}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCategories();
