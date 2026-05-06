
const mongoose = require('mongoose');
const { connectDB } = require('./config/database');
const User = require('./models/User.model');

async function run() {
  await connectDB();
  const merchants = await User.find({ role: 'merchant' });
  console.log('--- MERCHANTS SUMMARY ---');
  console.log('Total merchants:', merchants.length);
  merchants.forEach(m => {
    console.log(`- ID: ${m._id}`);
    console.log(`  Name: ${m.merchantName || m.username}`);
    console.log(`  Approved: ${m.approved}`);
    console.log(`  Suspended: ${m.suspended}`);
    console.log(`  Logo: ${m.logo}`);
    console.log('------------------------');
  });
  mongoose.connection.close();
}

run();
