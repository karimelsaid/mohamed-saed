const mongoose = require('mongoose');
const Post = require('./Backend/models/Post.model');
const User = require('./Backend/models/User.model');
require('dotenv').config({ path: './Backend/.env' });

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kenouz');
        console.log('Connected to MongoDB');

        const admins = await User.find({ role: 'admin' });
        const adminIds = admins.map(a => a._id.toString());
        console.log('Found admins:', adminIds);

        const result = await Post.updateMany(
            { userId: { $in: adminIds } },
            { $set: { userRole: 'admin' } }
        );

        console.log(`Updated ${result.modifiedCount} posts to admin role`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
