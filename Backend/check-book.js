const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection - use the same connection as the main app
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file');
  process.exit(1);
}

async function checkBook() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }), 'products');

    // البحث عن "أمة الدوبامين"
    const book = await Product.findOne({
      product_name: /أمة الدوبامين/i
    });

    if (book) {
      console.log('✅ Book found:', book.product_name);
      console.log('Status:', book.status);
      console.log('Quantity:', book.product_quantity);
      console.log('Category:', book.product_category);
    } else {
      console.log('❌ Book not found');
    }

    // البحث عن كتب مشابهة
    const similar = await Product.find({
      product_name: /دوبامين/i
    }).limit(5);

    console.log('\n📚 Books with "دوبامين" in name:');
    similar.forEach(b => console.log(`- ${b.product_name} (${b.status}, qty: ${b.product_quantity})`));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBook();
