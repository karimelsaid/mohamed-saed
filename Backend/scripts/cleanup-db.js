const mongoose = require('mongoose');
require('dotenv').config({ path: 'Backend/.env' });

const allowedCategories = [
    'روايات وقصص',
    'تطوير الذات وعلم النفس',
    'كتب دينية',
    'قواميس ومراجع',
    'صحة وطب وعلوم',
    'أعمال وتسويق ومالية',
    'فنون وحرف',
    'تاريخ وسير ذاتية',
    'تربية وأطفال',
    'أدوات مكتبية',
    'كتب',
    'غير مصنف'
];

async function cleanupDB() {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI not found in .env');
        }
        
        await mongoose.connect(uri);
        console.log('Connected to MongoDB Atlas.');

        const db = mongoose.connection.db;
        const collection = db.collection('products');

        const result = await collection.deleteMany({
            product_category: { $nin: allowedCategories }
        });

        console.log(`Deleted ${result.deletedCount} products from MongoDB.`);
        
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    } catch (error) {
        console.error('Database cleanup error:', error.message);
        process.exit(1);
    }
}

cleanupDB();
