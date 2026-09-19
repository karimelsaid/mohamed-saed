const mongoose = require('mongoose');
const User = require('./models/User.model');
require('dotenv').config();

const emailsToDelete = [
  '69aae44cf110a6d003c4d85b@merchant.knoozbook.com',
  '692c4a058ae7024b6c033127@merchant.knoozbook.com',
  'kenouz9999@gmail.com',
  'karimmohamed2729_db_user@knoozbook.com'
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    const result = await User.deleteMany({ email: { $in: emailsToDelete } });
    console.log(`Deleted ${result.deletedCount} merchants.`);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
