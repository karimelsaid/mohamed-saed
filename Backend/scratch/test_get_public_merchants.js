const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const User = require('../models/User.model');
const Product = require('../models/Product.model');
const fs = require('fs');
const path = require('path');

const normalizeArabic = (str) => {
  if (!str) return '';
  return str
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // Remove diacritics
    .trim()
    .toLowerCase();
};

async function run() {
  await connectDB();
  
  try {
    const merchants = await User.find({ 
      role: 'merchant', 
      approved: true, 
      suspended: { $ne: true } 
    })
    .select('username merchantName logo bio coverPhoto _id')
    .sort({ createdAt: -1 });

    console.log('Total merchants from DB:', merchants.length);
    
    // 1. Get all unique publishers that have products in the system (from DB & Excel output.json)
    const activePublishersRaw = await Product.distinct('publisher');
    
    let excelPublishers = [];
    try {
      const outputJsonPath = path.join(__dirname, '../../output.json');
      if (fs.existsSync(outputJsonPath)) {
        const excelData = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
        excelPublishers = excelData
          .map(b => b.publisher)
          .filter(p => p && p.trim());
      }
    } catch (excelErr) {
      console.error('Error reading output.json for publishers:', excelErr);
    }

    const allPublishers = [...activePublishersRaw, ...excelPublishers];
    const normalizedActivePublishers = allPublishers
      .filter(p => p && p.trim())
      .map(p => normalizeArabic(p));

    console.log('Normalized Active Publishers count:', normalizedActivePublishers.length);
    console.log('normalizedActivePublishers includes الصفا:', normalizedActivePublishers.includes(normalizeArabic('الصفا')));
    console.log('normalizedActivePublishers includes دار اللؤلؤة:', normalizedActivePublishers.includes(normalizeArabic('دار اللؤلؤة')));

    // 2. Format Merchants (User model)
    const formattedMerchants = merchants
      .map(m => {
        const name = m.merchantName || m.username;
        return {
          _id: m._id,
          name: name,
          logo: m.logo,
          bio: m.bio,
          coverPhoto: m.coverPhoto,
          normalizedName: normalizeArabic(name)
        };
      })
      .filter(m => normalizedActivePublishers.includes(m.normalizedName));

    console.log('Formatted Merchants (User Model) count:', formattedMerchants.length);

    // 3. Add Virtual Publishers (those who have an uploaded logo in the publishers folder)
    const publishersDir = path.join(__dirname, '../../uploads/books/publishers');
    console.log('Publishers directory path:', publishersDir);
    console.log('Publishers directory exists:', fs.existsSync(publishersDir));
    
    if (fs.existsSync(publishersDir)) {
      const files = fs.readdirSync(publishersDir);
      console.log('Files in publishers folder:', files);
      files.forEach(file => {
        if (file.endsWith('.webp') || file.endsWith('.png') || file.endsWith('.jpg')) {
          const rawPublisherName = file.replace(/\.(webp|png|jpg)$/, '').replace(/[_-]/g, ' ').trim();
          const normalizedFileName = normalizeArabic(rawPublisherName);
          console.log(`Processing file: ${file}, rawName: ${rawPublisherName}, normalizedName: ${normalizedFileName}`);
          
          const hasProducts = normalizedActivePublishers.includes(normalizedFileName);
          console.log(`- hasProducts: ${hasProducts}`);
          
          if (hasProducts) {
            const isDuplicate = formattedMerchants.some(m => m.normalizedName === normalizedFileName);
            console.log(`- isDuplicate: ${isDuplicate}`);
            
            if (!isDuplicate) {
              formattedMerchants.push({
                _id: rawPublisherName,
                name: rawPublisherName,
                logo: `publishers/${file}`,
                bio: `إصدارات ${rawPublisherName}`,
                isPublisher: true,
                normalizedName: normalizedFileName
              });
            }
          }
        }
      });
    }

    const finalMerchants = formattedMerchants.map(({ normalizedName, ...rest }) => rest);
    console.log('Final Merchants returned:', finalMerchants);

  } catch (err) {
    console.error(err);
  }

  mongoose.connection.close();
}

run();
