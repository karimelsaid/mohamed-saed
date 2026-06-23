const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env.MONGO_URI;

async function run() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected.');

  const db = mongoose.connection.db;
  const phoneShort = '1093418988';

  // Deep search: scan users collection and stringify each doc to find the phone
  console.log('🔍 بحث عميق في users (stringify كل document)...');
  const usersCol = db.collection('users');
  const cursor = usersCol.find({}).project({ username: 1, phone: 1, email: 1, governorate: 1, city: 1, village: 1, postOffice: 1, orders: 1 });
  
  let count = 0;
  let found = false;
  
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    count++;
    const str = JSON.stringify(doc);
    if (str.includes(phoneShort)) {
      found = true;
      console.log(`\n✅ وُجد! (document #${count})`);
      console.log('الاسم:', doc.username);
      console.log('الهاتف:', doc.phone);
      console.log('الإيميل:', doc.email);
      console.log('المحافظة:', doc.governorate || 'غير محدد');
      console.log('المدينة:', doc.city || 'غير محدد');
      console.log('القرية:', doc.village || 'غير محدد');
      if (doc.postOffice) console.log('مكتب البريد:', JSON.stringify(doc.postOffice, null, 2));
      
      // Find matching orders
      if (doc.orders) {
        const matchingOrders = doc.orders.filter(o => JSON.stringify(o).includes(phoneShort));
        if (matchingOrders.length > 0) {
          console.log(`\n📦 أوردرات بالرقم ده (${matchingOrders.length}):`);
          matchingOrders.forEach((o, i) => {
            console.log(`\nأوردر ${i+1}:`);
            if (o.shippingAddress) console.log('عنوان الشحن:', JSON.stringify(o.shippingAddress, null, 2));
            if (o.address) console.log('العنوان:', o.address);
            if (o.postOffice) console.log('مكتب البريد:', JSON.stringify(o.postOffice, null, 2));
          });
        }
      }
      break;
    }
  }

  if (!found) {
    console.log(`❌ تم فحص ${count} مستخدم - الرقم ${phoneShort} مش موجود في أي document`);
    
    // Also deep search other key collections
    const colsToSearch = ['orders', 'products', 'messages', 'feedbacks'];
    for (const colName of colsToSearch) {
      try {
        const col = db.collection(colName);
        const docCount = await col.countDocuments();
        if (docCount === 0) continue;
        
        console.log(`\n🔍 بحث عميق في ${colName} (${docCount} documents)...`);
        const cur = col.find({});
        let idx = 0;
        while (await cur.hasNext()) {
          const doc = await cur.next();
          idx++;
          if (JSON.stringify(doc).includes(phoneShort)) {
            console.log(`✅ وُجد في ${colName}! document #${idx}`);
            console.log(JSON.stringify(doc, null, 2).substring(0, 2000));
            break;
          }
        }
      } catch(e) {}
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(console.error);
