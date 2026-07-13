const mongoose = require('mongoose');
const Product = require('../models/Product.model');
require('dotenv').config();

// MongoDB connection - use same URI as the main app
const MONGODB_URI = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function removeDuplicates() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // First, get total count before
    const totalBefore = await Product.countDocuments();
    console.log(`Total products before cleanup: ${totalBefore}`);

    // Find all duplicates by product_name + publisher combination
    const duplicates = await Product.aggregate([
      {
        $group: {
          _id: { 
            product_name: '$product_name', 
            publisher: '$publisher' 
          },
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', name: '$product_name', publisher: '$publisher', barcode: '$barcode', createdAt: '$createdAt' } }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    console.log(`Found ${duplicates.length} duplicate product_name + publisher combinations`);

    let totalRemoved = 0;

    for (const duplicate of duplicates) {
      const products = duplicate.docs;
      
      // Sort by createdAt to keep the oldest one
      products.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      // Keep the first one (oldest), remove the rest
      const toRemove = products.slice(1).map(p => p.id);
      
      if (toRemove.length > 0) {
        const result = await Product.deleteMany({ _id: { $in: toRemove } });
        totalRemoved += result.deletedCount;
        console.log(`Removed ${result.deletedCount} duplicates for: ${products[0].name} (${products[0].publisher}) - kept barcode: ${products[0].barcode}`);
      }
    }

    const totalAfter = await Product.countDocuments();
    console.log(`Total products after cleanup: ${totalAfter}`);
    console.log(`Total duplicates removed: ${totalRemoved}`);
    console.log('Done!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

removeDuplicates();
