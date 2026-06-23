const mongoose = require('mongoose');
const User = require('./models/User.model');
require('dotenv').config();

async function checkAdmin() {
  const uri = "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";
  try {
    console.log('Connecting to', uri);
    await mongoose.connect(uri, { family: 4 });
    const user = await User.findById('69d11b07df78621a8d7b1559').lean();
    console.log('Admin User:', JSON.stringify(user, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkAdmin();
