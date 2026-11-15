import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { hashPassword, normalizePhone } from '../modules/identity/crypto.js';

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'mihnati';
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const now = new Date();

  // 1. Ensure Ali Nashed is cleanly merchant role
  const aliUser = await db.collection('users').findOne({ phone: normalizePhone('01011') });
  if (aliUser) {
    // Keep only merchant role for Ali Nashed
    await db.collection('user_role_assignments').deleteMany({ userId: aliUser._id });
    await db.collection('user_role_assignments').insertOne({
      _id: 'ura_merchant_' + aliUser._id,
      userId: aliUser._id,
      roleKey: 'merchant',
      status: 'active',
      grantedBy: 'system',
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`✅ Ali Nashed fixed as Merchant only.`);
  }

  // 2. Ensure test Craftsman (صنايعي)
  const proPhone = normalizePhone('01022222222');
  let proUser = await db.collection('users').findOne({ phone: proPhone });
  const proPasswordHash = await hashPassword('ProPassword123!');
  if (!proUser) {
    const userId = 'usr_pro_sample';
    await db.collection('users').insertOne({
      _id: userId,
      phone: proPhone,
      passwordHash: proPasswordHash,
      name: 'محمود السباك (فني مهني)',
      locale: 'ar',
      status: 'active',
      phoneVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    proUser = await db.collection('users').findOne({ _id: userId });
  } else {
    await db.collection('users').updateOne(
      { _id: proUser._id },
      { $set: { passwordHash: proPasswordHash, status: 'active', updatedAt: now } }
    );
  }

  await db.collection('user_role_assignments').deleteMany({ userId: proUser!._id });
  await db.collection('user_role_assignments').insertOne({
    _id: 'ura_pro_' + proUser!._id,
    userId: proUser!._id,
    roleKey: 'professional',
    status: 'active',
    grantedBy: 'system',
    grantedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`✅ Craftsman user ready: 01022222222 / ProPassword123!`);

  // 3. Ensure test Customer (عميل)
  const custPhone = normalizePhone('01033333333');
  let custUser = await db.collection('users').findOne({ phone: custPhone });
  const custPasswordHash = await hashPassword('CustomerPassword123!');
  if (!custUser) {
    const userId = 'usr_cust_sample';
    await db.collection('users').insertOne({
      _id: userId,
      phone: custPhone,
      passwordHash: custPasswordHash,
      name: 'أحمد العميل (طلب خدمات)',
      locale: 'ar',
      status: 'active',
      phoneVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    custUser = await db.collection('users').findOne({ _id: userId });
  } else {
    await db.collection('users').updateOne(
      { _id: custUser._id },
      { $set: { passwordHash: custPasswordHash, status: 'active', updatedAt: now } }
    );
  }

  await db.collection('user_role_assignments').deleteMany({ userId: custUser!._id });
  await db.collection('user_role_assignments').insertOne({
    _id: 'ura_cust_' + custUser!._id,
    userId: custUser!._id,
    roleKey: 'customer',
    status: 'active',
    grantedBy: 'system',
    grantedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`✅ Customer user ready: 01033333333 / CustomerPassword123!`);

  await client.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

