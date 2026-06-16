const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getExcelData } = require('../controllers/books.controller');
const Product = require('../models/Product.model');

const uri = process.env.MONGO_URI;

async function run() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  const booksController = require('../controllers/books.controller');
  
  console.log('Fetching unified data...');
  const start = Date.now();
  
  // Call internal helper by requiring it
  // Wait, fetchUnifiedData is not exported, but we can call getExcelData or modify books.controller.js to export it,
  // or we can copy/paste or just use a mock req/res to call getExcelData.
  
  const mockReq = { query: {} };
  const mockRes = {
    json: (data) => {
      console.log(`✨ Success! Fetched ${data.length} books in ${Date.now() - start}ms`);
      if (data.length > 0) {
        console.log('First book sample:', JSON.stringify(data[0], null, 2));
      } else {
        console.log('⚠️ Returned data array is empty!');
      }
    },
    status: (code) => {
      return {
        json: (err) => {
          console.error(`❌ HTTP Status ${code}:`, err);
        }
      };
    }
  };

  await getExcelData(mockReq, mockRes);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
