const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config({ path: '/var/www/kenouz/.env' });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 }).then(async () => {
  console.log('Connected!');
  const db = mongoose.connection.db;
  const products = await db.collection('products').find({ status: 'approved' }).project({ viewHistory: 0, updatedData: 0 }).toArray();
  const merchants = await db.collection('users').find({ role: { $in: ['merchant','admin'] } }).project({ _id:1, name:1, merchantName:1, logo:1, merchantShippingMethod:1 }).toArray();
  const mMap = {};
  merchants.forEach(m => { mMap[m._id.toString()] = { name: m.merchantName || m.name || 'كنوز', logo: m.logo || '', shippingMethod: m.merchantShippingMethod || 'knoozbook' }; });
  const enriched = products.map(p => ({ ...p, _id: p._id.toString(), merchantId: p.merchantId ? p.merchantId.toString() : null, merchantName: p.merchantId ? (mMap[p.merchantId.toString()]?.name || 'كنوز') : 'كنوز', isDbProduct: true, products_id: p.products_id || p.barcode || p._id.toString() }));
  const outPath = '/var/www/kenouz/output.json';
  const rawPath = '/var/www/kenouz/output_raw.json';
  fs.writeFileSync(outPath, JSON.stringify(enriched));
  fs.writeFileSync(rawPath, JSON.stringify(enriched));
  console.log('Done! Products:', enriched.length);
  process.exit(0);
}).catch(e => { console.error('Error:', e.message); process.exit(1); });
