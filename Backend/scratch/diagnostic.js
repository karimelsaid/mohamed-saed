const mongoose = require('mongoose');
const User = require('../models/User.model');
require('dotenv').config();

const uri = "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function diagnose() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(uri, { family: 4 });
    console.log('Connected successfully!');

    const totalUsers = await User.countDocuments();
    console.log(`Total Users in DB: ${totalUsers}`);

    // Find all users who have orders
    const usersWithOrders = await User.find({ 'orders.0': { $exists: true } }).lean();
    console.log(`Users with at least one order: ${usersWithOrders.length}`);

    if (usersWithOrders.length > 0) {
      console.log('\n--- Sample Order Structure ---');
      const sampleUser = usersWithOrders[0];
      console.log(`User: ${sampleUser.username} (${sampleUser._id})`);
      console.log(`Role: ${sampleUser.role}`);
      console.log(`Orders Count: ${sampleUser.orders.length}`);
      
      const sampleOrder = sampleUser.orders[0];
      console.log(JSON.stringify(sampleOrder, null, 2));
    } else {
      console.log('\n⚠️ No users found with orders in their orders array!');
      
      // Let's search if orders are stored in a separate collection instead?
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('\nCollections in database:');
      collections.forEach(c => console.log(` - ${c.name}`));
    }

  } catch (err) {
    console.error('Error during diagnosis:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

diagnose();
