const mongoose = require('mongoose');
const User = require('../models/User.model');
require('dotenv').config();

async function queryUser() {
  const uri = "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";
  try {
    console.log('Connecting...');
    await mongoose.connect(uri, { family: 4 });
    const user1 = await User.findById('67683937397e5b22b07b1406').lean();
    console.log('User 67683937397e5b22b07b1406:', user1);
    
    const adminUser = await User.findOne({ role: 'admin' }).lean();
    console.log('Any Admin User:', adminUser ? { _id: adminUser._id, username: adminUser.username } : 'None');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

queryUser();
