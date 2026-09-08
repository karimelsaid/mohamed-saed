const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const MobileVersion = require('../models/MobileVersion.model');

const version = process.argv[2] || '1.10.5';

async function updateVersion() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz";
    await mongoose.connect(mongoUri);
    
    let config = await MobileVersion.findOneAndUpdate(
      { app: 'mushaf' },
      { 
        $set: { 
          'liveUpdate.version': version,
          'liveUpdate.enabled': true,
          'liveUpdate.zipUrl': 'https://knoozbook.com/mushaf-bundle.zip'
        } 
      },
      { new: true, upsert: true }
    );

    console.log('✅ Updated DB Mushaf Version Config:');
    console.log(config.liveUpdate);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating version:', error.message);
    process.exit(1);
  }
}

updateVersion();
