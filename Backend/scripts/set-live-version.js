const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const MobileVersion = require('../models/MobileVersion.model');

/**
 * سكريبت لتحديث نسخة الـ Live Update في قاعدة البيانات بسهولة
 * Usage: node scripts/set-live-version.js <version> <enabled> <zipUrl>
 * Example: node scripts/set-live-version.js 1.1.0 true https://knoozbook.com/mobile/bundle.zip
 */

const version = process.argv[2];
const enabled = process.argv[3] === 'true';
const zipUrl = process.argv[4] || 'https://knoozbook.com/mobile/bundle.zip';

if (!version) {
  console.log('❌ يرجى تحديد رقم النسخة. مثال:');
  console.log('node scripts/set-live-version.js 1.1.0 true');
  process.exit(1);
}

async function updateVersion() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz";
    await mongoose.connect(mongoUri);
    
    let config = await MobileVersion.findOne();
    if (!config) {
      config = new MobileVersion();
    }

    config.liveUpdate = {
      version: version,
      enabled: enabled,
      zipUrl: zipUrl
    };

    await config.save();
    console.log('✅ تم تحديث قاعدة البيانات بنجاح:');
    console.log(`🚀 النسخة الحالية: ${version}`);
    console.log(`📡 التحديث مفعل: ${enabled}`);
    console.log(`🔗 رابط الملف: ${zipUrl}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ خطأ أثناء التحديث:', error.message);
    process.exit(1);
  }
}

updateVersion();
