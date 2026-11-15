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

  console.log(`Connecting to MongoDB ${dbName}...`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  // Check existing users and admin roles
  const adminRoles = await db.collection('user_role_assignments').find({ roleKey: 'admin' }).toArray();
  console.log(`Found ${adminRoles.length} admin role assignments.`);

  const adminPhone = '01000000001';
  const adminPassword = 'AdminPassword123!';
  const normalizedPhone = normalizePhone(adminPhone);

  let adminUser = await db.collection('users').findOne({ phone: normalizedPhone });

  if (!adminUser) {
    console.log(`Creating default super-admin user with phone: ${adminPhone}...`);
    const passwordHash = await hashPassword(adminPassword);
    const userId = 'usr_admin_default';

    await db.collection('users').insertOne({
      _id: userId as any,
      phone: normalizedPhone,
      passwordHash,
      name: 'مدير منصة مهنتي (Super Admin)',
      locale: 'ar',
      status: 'active',
      phoneVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    adminUser = await db.collection('users').findOne({ _id: userId as any });
  } else {
    console.log(`Admin user with phone ${adminPhone} already exists.`);
    // Reset password to ensure known credentials
    const passwordHash = await hashPassword(adminPassword);
    await db.collection('users').updateOne(
      { _id: adminUser._id },
      { $set: { passwordHash, status: 'active', phoneVerified: true, updatedAt: new Date() } }
    );
    console.log(`Password reset to: ${adminPassword}`);
  }

  // Ensure admin role is assigned
  const roleAssignment = await db.collection('user_role_assignments').findOne({
    userId: adminUser!._id,
    roleKey: 'admin',
  });

  if (!roleAssignment) {
    await db.collection('user_role_assignments').insertOne({
      _id: 'ura_admin_' + adminUser!._id,
      userId: adminUser!._id,
      roleKey: 'admin',
      status: 'active',
      grantedBy: 'system',
      grantedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    console.log(`Admin role granted to ${adminUser!._id}.`);
  } else {
    console.log(`Admin role already active for ${adminUser!._id}.`);
  }

  console.log('\n===========================================');
  console.log('✅ Admin credentials are ready:');
  console.log(`📞 رقم الهاتف (Phone): ${adminPhone}`);
  console.log(`🔑 كلمة المرور (Password): ${adminPassword}`);
  console.log(`👤 الاسم: ${adminUser?.['name']}`);
  console.log('===========================================\n');

  await client.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

