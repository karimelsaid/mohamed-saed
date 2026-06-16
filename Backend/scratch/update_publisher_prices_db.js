const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/Product.model');

async function updatePublisherPrices() {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz");
    console.log('Connected to MongoDB');

    // 1. Update MongoDB
    const result = await Product.updateMany(
      { publisher: { $exists: true, $ne: '' } },
      [
        {
          $set: {
            price_cost: {
              $round: [{ $multiply: [{ $toDouble: '$product_price' }, 0.9] }, 2]
            }
          }
        }
      ]
    );
    console.log(`✅ MongoDB Update Result: matched ${result.matchedCount}, modified ${result.modifiedCount}`);

    // 2. Update local JSON files
    const rawPath = path.join(__dirname, '../output_raw.json');
    const outputPath = path.join(__dirname, '../output.json');

    if (fs.existsSync(rawPath)) {
      const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
      let updatedCount = 0;
      rawData.forEach(p => {
        if (p.publisher && String(p.publisher).trim() !== '') {
          const price = parseFloat(p.product_price) || 0;
          p.price_cost = Math.ceil(price * 0.9); // Round up to nearest EGP or keep as decimal?
          updatedCount++;
        }
      });
      fs.writeFileSync(rawPath, JSON.stringify(rawData, null, 2));
      console.log(`✅ Updated ${updatedCount} products in output_raw.json`);
    }

    if (fs.existsSync(outputPath)) {
      const outputData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      let updatedCount = 0;
      outputData.forEach(p => {
        if (p.publisher && String(p.publisher).trim() !== '') {
          const price = parseFloat(p.product_price) || 0;
          p.price_cost = Math.ceil(price * 0.9);
          updatedCount++;
        }
      });
      fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
      console.log(`✅ Updated ${updatedCount} products in output.json`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error during update:', error);
    process.exit(1);
  }
}

updatePublisherPrices();
